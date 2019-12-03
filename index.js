const puppeteer = require('puppeteer');
const CREDS = require('./secrets/creds');
const SECTIONS = require('./secrets/sections');
const TEMPLATE_HOME_URL = 'https://codehs.com/lms/assignments/{0}/section/{1}/time_tracking';
const TEMPLATE_STUDENT_URL = 'https://codehs.com/student/{0}/section/{1}/assignment/{2}/';
const TEMPLATE_ROSTER = 'https://codehs.com/section/{0}/roster/info';
const format = require('string-format');
const util = require('util');
const fs = require('fs');
const pLimit = require('p-limit');
const path = require('path');
const networkLimit = pLimit(1); //probably wont work scaled up, should be 1 if useCache : false
const mkdirp = require('mkdirp');


console.log('loaded index.js');
let arr_args = process.argv.slice(2);

if (arr_args.length === 0) {
    arr_args = ['11/22/19', '11:11', '2', 'Rolling+Dice', 'Teenagers', '2', 'm0', 's0', 'true', 'false'];
}

// console.log('arguments', arr_args);

let arr_dueDate = arr_args[0].split('/');
let arr_dueTime = arr_args[1].split(':');

let date_dueDate = new Date((arr_dueDate[2].length !== 4 ? 2000 + (+arr_dueDate[2]) : +arr_dueDate[2]),
    +arr_dueDate[0], +arr_dueDate[1], +arr_dueTime[0], +arr_dueTime[0], 0, 0);

//will not work ... below this ???
String.prototype.replaceAll = function (search, replacement) {
    let target = this;
    return target.replace(new RegExp(search, 'g'), replacement);
};

let assignmentsCount = +arr_args[2];
let arr_assignments = [];
for (let i = 0; i < assignmentsCount; i++) {
    let temp_str = "" + arr_args[3 + i];
    arr_assignments.push(temp_str.replaceAll("\\\+", " ").toString().toLowerCase());
}

let arr_objs_classes = [];
let teachersCount = +arr_args[3 + assignmentsCount];
for (let i = 0; i < teachersCount; i++) {
    let rawTeacherStr = arr_args[4 + assignmentsCount + i];
    let teacherInitial = rawTeacherStr.charAt(0);
    let teacherName = SECTIONS[teacherInitial].name;
    let teacherStr = rawTeacherStr.substring(1);
    teacherStr.trim().split('').forEach(char => {
        if (char === '0') {
            //0 --> All classes
            for (let classNum in SECTIONS[teacherInitial].classes) {
                if (!SECTIONS[teacherInitial].classes.hasOwnProperty(classNum)) continue;
                let obj_todo = {
                    teacherName: teacherName,
                    url: format(TEMPLATE_HOME_URL, SECTIONS[teacherInitial].id, SECTIONS[teacherInitial].classes[classNum]),
                    classNum: classNum,
                    sectionId: SECTIONS[teacherInitial].id,
                    classId: SECTIONS[teacherInitial].classes[classNum],
                    students: []
                };
                arr_objs_classes.push(obj_todo);
            }
        } else {
            let classNum = +char;
            let obj_todo = {
                teacherName: teacherName,
                url: format(TEMPLATE_HOME_URL, SECTIONS[teacherInitial].id, SECTIONS[teacherInitial].classes[classNum]),
                classNum: classNum,
                sectionId: SECTIONS[teacherInitial].id,
                classId: SECTIONS[teacherInitial].classes[classNum],
                students: []
            };
            arr_objs_classes.push(obj_todo);
        }
    })
}

let boolean_useCache = arr_args[assignmentsCount + teachersCount + 4] === 'true';
console.info('use cache?', boolean_useCache);
let boolean_buildCache = arr_args[assignmentsCount + teachersCount + 5] === 'true';
console.info('(re)build cache?', boolean_buildCache);

console.info(date_dueDate);
console.info(arr_assignments);

start().then();

async function start() {
    const browser = await puppeteer.launch({
        headless: false //TODO: remove for production
    });
    const page = await browser.newPage();
    await loginCodeHS(page);

    // arr_objs_classes = arr_objs_classes.splice(arr_objs_classes.length - 1); //TODO: delete for prod
    //TODO: use this to choose which class

    await Promise.all(arr_objs_classes.map((obj) => {
        return networkLimit(() => combinedSteps(obj))
    }));

    // console.info(util.inspect(arr_objs_classes, false, null, true));

    await browser.close(); //TODO: uncomment in production

    async function loginCodeHS(pg) {
        await pg.goto('https://codehs.com/login', {waitUntil: 'networkidle2'});

        const EMAIL_SELECTOR = '#login-email';
        const PASSWORD_SELECTOR = '#login-password';
        const BUTTON_SELECTOR = '#login-submit';

        await pg.click(EMAIL_SELECTOR);
        await pg.keyboard.type(CREDS.email);

        await pg.click(PASSWORD_SELECTOR);
        await pg.keyboard.type(CREDS.password);

        await pg.click(BUTTON_SELECTOR);
        await pg.waitForNavigation();
        await pg.close();
        return 'done';
    }

    async function combinedSteps(classObj) {
        return new Promise(async (a, b) => {
            await parseClassPages(classObj, arr_objs_classes, browser);
            await writeClass(classObj);
            a(Date.now());
        })
    }

    function writeClass(classObj) {
        return new Promise((re, reje) => {
            let content_rows = [];
            let headers = ['Name', 'Period', 'E-mail'];
            arr_assignments.forEach(assignmentName => {
                headers.push('Problem', 'Due', 'First Try', 'First Time', 'Time Worked By Due Date', 'Total Time Worked', 'On Time Status', 'Problem Status', 'Points');
            });
            headers.push('Total Points Awarded', 'Total Points Possible', 'On Time?');
            content_rows.push(headers);
            classObj.students.forEach(studentObj => {
                let studentRow = [];
                studentRow.push('"' + studentObj.lastName + ', ' + studentObj.firstName + '"');
                studentRow.push(classObj.classNum);
                studentRow.push('TBD'); //TODO: get student email

                Number.prototype.padLeft = function (base, chr) {
                    let len = (String(base || 10).length - String(this).length) + 1;
                    return len > 0 ? new Array(len).join(chr || '0') + this : this;
                };

                let totalAwarded = 0;
                let totalPossible = 0;

                Object.keys(studentObj.assignments).forEach(assignmentIDs => {
                    studentRow.push(studentObj.assignments[assignmentIDs].problemName);
                    let d = date_dueDate;
                    studentRow.push([(d.getMonth() + 1).padLeft(),
                            d.getDate().padLeft(),
                            d.getFullYear()].join('/') + ' ' +
                        [d.getHours().padLeft(),
                            d.getMinutes().padLeft(),
                            d.getSeconds().padLeft()].join(':'));
                    studentRow.push(studentObj.assignments[assignmentIDs].firstTryDate);
                    studentRow.push(studentObj.assignments[assignmentIDs].firstTryTime);
                    studentRow.push(studentObj.assignments[assignmentIDs].timeWorkedBeforeDue);
                    studentRow.push(studentObj.assignments[assignmentIDs].timeWorkedTotal);
                    studentRow.push(studentObj.assignments[assignmentIDs].onTimeStatus);
                    studentRow.push(studentObj.assignments[assignmentIDs].problemStatus);
                    studentRow.push(studentObj.assignments[assignmentIDs].pointsAwarded);
                    totalAwarded += (+studentObj.assignments[assignmentIDs].pointsAwarded);
                    totalPossible += (+studentObj.assignments[assignmentIDs].maxPoints);
                });

                studentRow.push(totalAwarded);
                studentRow.push(totalPossible);
                studentRow.push('tbd');
                content_rows.push(studentRow);
            });
            let csvContent = content_rows.map(e => e.join(",")).join("\n");
            if (!fs.existsSync('./out/data')) {
                fs.mkdirSync('./out/data');
            }
            fs.writeFile('./out/data/' + classObj.teacherName + '_P' + classObj.classNum + '.csv', csvContent, function (err) {
                if (err) {
                    reje('failed');
                    return console.log(err);
                }
                console.log(classObj.teacherName + '_P' + classObj.classNum + '.csv was saved');
                re(classObj.teacherName + '_P' + classObj.classNum + '.csv ');
            })
        });
    }
}


async function parseClassPages(obj, arr_objs_classes, browser) {
    return new Promise(async (resolve, reject) => {
        const page = await browser.newPage();
        let cached_modulePath = './cached/' + obj.sectionId + '/' + obj.classId;
        let url_sectionAllModule = format('https://codehs.com/lms/assignments/{0}/section/{1}/progress/module/0', obj.sectionId, obj.classId);
        if (boolean_useCache) {
            await fs.promises.access(cached_modulePath + '/index.html').then(success => {
                //use cache
                url_sectionAllModule = `file:${path.join(__dirname, cached_modulePath + '/index.html')}`;
            }).catch(err => {
                boolean_useCache = false;
            });
        }
        let pageGoOptions = {
            waitUntil: 'networkidle2',
            timeout: 0
        };
        if (boolean_useCache) {
            pageGoOptions.timeout = 1;
        }
        await page.goto(url_sectionAllModule, pageGoOptions).catch(errObj => {
            if (errObj.name !== 'TimeoutError') {
                console.info('yikes');
            }
        });
        await page.waitForSelector('#activity-progress-table', {visible: true, timeout: 0});
        // console.info('build cache ? ', boolean_buildCache);
        if (boolean_buildCache) {
            let bodyHTML = await page.evaluate(() => document.body.innerHTML);
            mkdirp(cached_modulePath, function (err) {
                if (err) console.error('could not create directory..???');
                else {
                    //TODO: If usecache and buildcache both = true, build cache w new res after use cache
                    fs.writeFile(cached_modulePath + '/index.html', bodyHTML, function (error) {
                        if (error) {
                            console.error(error);
                        } else {
                            // console.info('wrote file');
                        }
                    });
                }
            });
        }

        let arr_assignmentsCopy = arr_assignments.slice();
        let [arr_assignmentIDs, arr_obj_students] = await page.evaluate((arr_assignmentsCopy) => {
            console.info(arr_assignmentsCopy);
            let arr_IDs = [];
            let children_possibleNodes = document.getElementsByClassName('activity-item');
            for (let i = 0; i < children_possibleNodes.length; i++) {
                if (children_possibleNodes[i].getAttribute('data-original-title')) {
                    let str = children_possibleNodes[i].getAttribute('data-original-title').toLowerCase();
                    for (let j = 0; j < arr_assignmentsCopy.length; j++) {
                        if (str.includes(arr_assignmentsCopy[j])) {
                            //got one assignment
                            arr_IDs.push({
                                name: arr_assignmentsCopy[j],
                                url: children_possibleNodes[i].children[0].href
                            });
                            arr_assignmentsCopy.splice(j, 1);
                            break;
                        }
                    }
                    if (arr_assignmentsCopy.length === 0) {
                        //got all assignments needed
                        break;
                    }
                }
            }

            let arr_obj_students = [];
            let table = document.getElementById('activity-progress-table').children[0].getElementsByClassName('student-row');

            for (let i = 0; i < table.length; i++) {
                let student_firstName = table[i].getAttribute('data-first-name').toString();
                let student_lastName = table[i].getAttribute('data-last-name').toString();
                let obj_student = {
                    firstName: student_firstName,
                    lastName: student_lastName,
                    assignments: {}
                };

                let candidate_assignments = table[i].getElementsByClassName('progress-circle');
                for (let j = 0; j < candidate_assignments.length; j++) {
                    let refStr = candidate_assignments[j].href;
                    let refStrComponents = refStr.split('/');
                    if (refStr && refStrComponents.length >= 4) {
                        refStrComponents.slice().some(str => {
                            if (str.toString().trim().length >= 3) {
                                if (!str.match(/[a-zA-Z:]/g)) {
                                    //to parse it even if from cache
                                    obj_student.id = str;
                                    return '0';
                                }
                            }
                        });
                        break;
                    }
                }
                arr_obj_students.push(obj_student);
            }

            return [arr_IDs, arr_obj_students];
        }, arr_assignmentsCopy);

        for (let i = 0; i < arr_assignmentIDs.length; i++) {
            let temp_split = arr_assignmentIDs[i].url.substr(8).split('/');
            arr_assignmentIDs[i] = temp_split[6];
        }

        if (boolean_useCache) {
            await page.goto('https://www.codehs.com');
        }

        await page.addScriptTag({path: './node_modules/bottleneck/es5.js'});
        obj.students = await page.evaluate(
            async (arr_assignmentIDs, obj, TEMPLATE_STUDENT_URL, date_dueDate, arr_obj_students, TEMPLATE_ROSTER) => {
                //import bottleneck from script tag
                let Bottleneck = window.Bottleneck;
                const limiter = new Bottleneck({
                    maxConcurrent: 10,
                    minTime: 200
                });

                //add String.format utility
                if (!String.format) {
                    String.format = function (format) {
                        var args = Array.prototype.slice.call(arguments, 1);
                        return format.replace(/{(\d+)}/g, function (match, number) {
                            return typeof args[number] != 'undefined'
                                ? args[number]
                                : match
                                ;
                        });
                    };
                }

                //limits to one student for testing
                // arr_obj_students = arr_obj_students.splice(arr_obj_students.length - 1); //TODO: Delete this for prod

                console.info('fetching student pages', arr_obj_students);

                // fetch student's page
                await Promise.all(arr_obj_students.map(async (studentObject) => {
                    console.info('processing', studentObject);
                    await limiter.schedule(() => {
                        const allTasks = arr_assignmentIDs.map(async (key) => {
                            return new Promise((res, rej) => {
                                let xhr = new XMLHttpRequest();
                                xhr.onload = async function () {
                                    let document = this.responseXML;

                                    //get problem name
                                    let problemName = document.title.split('|')[0].trim();

                                    //get first try date/time
                                    let startedText = document.getElementById('started-time').getElementsByClassName('msg-content')[0].getElementsByTagName('p')[0].innerText;
                                    startedText = startedText.trim().substring(11).trim();
                                    let date_startDate = new Date(startedText.substring(0, startedText.length - 4));
                                    //attach date 'hours' modifier
                                    Date.prototype.addHours = function (h) {
                                        this.setTime(this.getTime() + (h * 60 * 60 * 1000));
                                        return this;
                                    };
                                    if (startedText.includes('p.m.')) {
                                        date_startDate.addHours(12);
                                    }
                                    // console.info('raw start text', startedText);
                                    // console.info('start date object', date_startDate);
                                    let year = date_startDate.getFullYear();
                                    let month = (1 + date_startDate.getMonth()).toString().padStart(2, '0');
                                    let day = date_startDate.getDate().toString().padStart(2, '0');
                                    let firstTryDate = month + '/' + day + '/' + year;
                                    let firstTryTime = date_startDate.toLocaleTimeString(navigator.language, {
                                        hour: '2-digit',
                                        minute: '2-digit'
                                    });

                                    //get problem status
                                    let messages = document.getElementById('status-message').children;
                                    let problemStatus;
                                    for (let i = 0; i < messages.length; i++) {
                                        if (messages[i].innerText) {
                                            let status = messages[i].innerText;
                                            if (status.includes(':')) {
                                                problemStatus = status.split(':')[1].trim();
                                            } else {
                                                //example programs arent graded... i think
                                                problemStatus = 'Finalized';
                                            }
                                            break;
                                        }
                                    }

                                    //get student grade
                                    let studentAssignmentID;
                                    let arr_candidate_scripts = document.getElementsByTagName('script');
                                    for (let i = 0; i < arr_candidate_scripts.length; i++) {
                                        let temp_innerText = arr_candidate_scripts[i].innerText;
                                        if (temp_innerText) {
                                            if (temp_innerText.includes('studentAssignmentID')) {
                                                temp_innerText = temp_innerText.substring(
                                                    temp_innerText.indexOf(':', temp_innerText.lastIndexOf('studentAssignmentID')) + 1).trim();
                                                // console.info('innerText', temp_innerText);
                                                studentAssignmentID = temp_innerText.split(' ')[0].substring(0, temp_innerText.indexOf(',')).trim();
                                                // console.info('student assignment ID', studentAssignmentID);
                                                break;
                                            }
                                        }
                                    }

                                    function formatParams(params) {
                                        return "?" + Object
                                            .keys(params)
                                            .map(function (key) {
                                                return key + "=" + encodeURIComponent(params[key])
                                            })
                                            .join("&")
                                    }

                                    function getCurrHistory() {
                                        return new Promise(function (r, j) {
                                            let historyRequest = new XMLHttpRequest();
                                            historyRequest.onload = function () {
                                                r(this.responseText);
                                            };
                                            let queryParams = {
                                                student_assignment_id: studentAssignmentID,
                                                method: 'get_grading_history'
                                            };
                                            historyRequest.open("GET", 'https://codehs.com/lms/ajax/get_grading_history' + formatParams(queryParams));
                                            historyRequest.send();
                                        });
                                    }

                                    let responseTxt = await getCurrHistory();
                                    // console.info('curr history response Txt', responseTxt);
                                    let responseObject = JSON.parse('' + responseTxt);
                                    let currentGrade = responseObject['current_status'];
                                    // console.info(currentGrade);
                                    let pointsAwarded = '' + currentGrade['score'];
                                    if (pointsAwarded.includes('-')) pointsAwarded = '0'; //not graded
                                    let maxPoints = currentGrade['out_of'];

                                    // get time worked
                                    let selectionField = document.getElementById('assignment-submission-select');
                                    if (selectionField != null) {
                                        let submissions = selectionField.getElementsByTagName('option');
                                        for (let i = 0; i < submissions.length; i++) {
                                            let date_submissionDate = new Date(submissions[i].innerText.substring(0, submissions[i].innerText.length - 4));
                                            //attach date 'hours' modifier
                                            Date.prototype.addHours = function (h) {
                                                this.setTime(this.getTime() + (h * 60 * 60 * 1000));
                                                return this;
                                            };
                                            if (submissions[i].innerText.includes('p.m.')) {
                                                date_submissionDate.addHours(12);
                                            }
                                            let value = submissions[i].getAttribute('value');
                                            let container_timeSpent = document.getElementById('time-spent-submission-message-' + value);
                                            let timeSpent = container_timeSpent.getElementsByTagName('span')[0].innerText;

                                        }
                                    }

                                    studentObject.assignments['' + key] = {
                                        problemName: problemName,
                                        firstTryDate: firstTryDate,
                                        firstTryTime: firstTryTime,
                                        timeWorkedBeforeDue: '',
                                        timeWorkedTotal: '',
                                        onTimeStatus: '',
                                        problemStatus: problemStatus,
                                        pointsAwarded: pointsAwarded,
                                        maxPoints: maxPoints
                                    };

                                    res(1);
                                };
                                // console.info(studentObject.id);
                                // console.info(obj.classId);
                                // console.info(key);
                                console.info(String.format(TEMPLATE_STUDENT_URL, studentObject.id, obj.classId, key));
                                xhr.open("GET", String.format(TEMPLATE_STUDENT_URL, studentObject.id, obj.classId, key));
                                xhr.responseType = "document";
                                xhr.send();
                                // console.info('XHR Sent', key);
                            })
                        });
                        return Promise.all(allTasks);
                    });
                }));

                //get student emails
                function fetchStudentEmails() {
                    return new Promise((resolve1, reject1) => {
                        let emailRequest = new XMLHttpRequest();
                        emailRequest.onload = function () {
                            resolve1(this.responseXML);
                        };
                        emailRequest.open("GET", String.format(TEMPLATE_ROSTER, obj.classId));
                        emailRequest.responseType = "document";
                        emailRequest.send();
                    });
                }

                let rosterDocument = await fetchStudentEmails();
                console.info('roster document', rosterDocument);

                function sleep(ms) {
                    return new Promise(resolve => setTimeout(resolve, ms));
                }

                await sleep(60000);

                return arr_obj_students;
            }, arr_assignmentIDs, obj, TEMPLATE_STUDENT_URL, date_dueDate, arr_obj_students, TEMPLATE_ROSTER
        );
        await page.close();
        // console.info('done obj', obj);
        resolve('done at ' + Date.now());
    })
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}