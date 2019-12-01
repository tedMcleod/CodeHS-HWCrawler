const pLimit = require('p-limit');
const limit = pLimit(2); //TODO: Change this to be based on cpu cores
const puppeteer = require('puppeteer');
const CREDS = require('./secrets/creds');
const SECTIONS = require('./secrets/sections');
const TEMPLATE_HOME_URL = 'https://codehs.com/lms/assignments/{0}/section/{1}/time_tracking';
const TEMPLATE_STUDENT_URL = 'https://codehs.com/student/{0}/section/{1}/assignment/{2}/';
const format = require('string-format');
const util = require('util');

console.log('loaded index.js');
let arr_args = process.argv.slice(2);

if (arr_args.length === 0) {
    arr_args = ['11/22/19', '11:11', '2', 'First+Boolean', 'President', '2', 'm0', 's0'];
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

console.info(date_dueDate);
console.info(arr_assignments);

start().then();

async function start() {
    const browser = await puppeteer.launch({
        headless: false
    });
    const page = await browser.newPage();
    await page.goto('https://codehs.com/login', {waitUntil: 'networkidle2'});

    const EMAIL_SELECTOR = '#login-email';
    const PASSWORD_SELECTOR = '#login-password';
    const BUTTON_SELECTOR = '#login-submit';

    await page.click(EMAIL_SELECTOR);
    await page.keyboard.type(CREDS.email);

    await page.click(PASSWORD_SELECTOR);
    await page.keyboard.type(CREDS.password);

    await page.click(BUTTON_SELECTOR);

    await page.waitForNavigation();

    arr_objs_classes = arr_objs_classes.splice(arr_objs_classes.length - 1); //TODO: delete for prod
    //TODO: use this to choose which class

    let arr_queue_fetchAssignmentId = arr_objs_classes.map(obj => getAssignmentIDs(obj, arr_objs_classes, browser));

    await Promise.all(arr_queue_fetchAssignmentId);

    console.info(util.inspect(arr_objs_classes, false, null, true));

    // await browser.close();
}


async function getAssignmentIDs(obj, arr_objs_classes, browser) {
    return new Promise(async (resolve, reject) => {
        const page = await browser.newPage();
        await page.goto(format('https://codehs.com/lms/assignments/{0}/section/{1}/progress/module/0', obj.sectionId, obj.classId), {
            waitUntil: 'networkidle2',
            timeout: 0
        });
        await page.waitForSelector('#activity-progress-table', {visible: true, timeout: 0});

        let arr_assignmentsCopy = arr_assignments.slice();
        let arr_assignmentIDs = await page.evaluate((arr_assignmentsCopy) => {
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
            return arr_IDs;
        }, arr_assignmentsCopy);

        for (let i = 0; i < arr_assignmentIDs.length; i++) {
            let temp_split = arr_assignmentIDs[i].url.substr(8).split('/');
            arr_assignmentIDs[i] = temp_split[6];
        }

        await page.addScriptTag({path: './node_modules/bottleneck/es5.js'});
        obj.students = await page.evaluate(
            async (arr_assignmentIDs, obj, TEMPLATE_STUDENT_URL) => {
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
                        if (refStr) {
                            obj_student.id = refStr.split('/')[4];
                            break;
                        }
                    }
                    arr_obj_students.push(obj_student);
                }

                //limits to one student for testing
                arr_obj_students = arr_obj_students.splice(arr_obj_students.length - 1); //TODO: Delete this for prod

                console.info('fetching student pages', arr_obj_students);

                // fetch student's page
                await Promise.all(arr_obj_students.map(async (studentObject) => {
                    console.info('processing', studentObject);
                    await limiter.schedule(() => {
                        const allTasks = arr_assignmentIDs.map(async (key) => {
                            return new Promise((res, rej) => {
                                let xhr = new XMLHttpRequest();
                                xhr.onload = function () {
                                    let document = this.responseXML;
                                    console.info('submission select', document.getElementById('assignment-submission-select'));

                                    //get problem name
                                    let problemName = document.title.split('|')[0].trim();

                                    //get first try date/time
                                    let startedText = document.getElementById('started-time').getElementsByClassName('msg-content')[0].getElementsByTagName('p')[0].innerText;
                                    startedText = startedText.trim().substring(11).trim();
                                    let date_startDate = new Date(startedText.substring(0, startedText.length-4));
                                    //attach date 'hours' modifier
                                    Date.prototype.addHours = function(h) {
                                        this.setTime(this.getTime() + (h*60*60*1000));
                                        return this;
                                    };
                                    if(startedText.includes())

                                    studentObject.assignments[''+key] = {
                                        problemName : problemName,
                                        firstTryDate: '',
                                        firstTryTime: '',
                                        timeWorkedBeforeDue: '',
                                        timeWorkedTotal: '',
                                        onTimeStatus: '',
                                        problemStatus: '',
                                        pointsAwarded: '',
                                        maxPoints: ''
                                    };

                                    res(1);
                                };
                                console.info(studentObject.id);
                                console.info(obj.classId);
                                console.info(key);

                                xhr.open("GET", String.format(TEMPLATE_STUDENT_URL, studentObject.id, obj.classId, key));
                                xhr.responseType = "document";
                                xhr.send();
                                console.info('XHR Sent', key);
                            })
                        });
                        return Promise.all(allTasks);
                    });
                }));

                return arr_obj_students;
            }, arr_assignmentIDs, obj, TEMPLATE_STUDENT_URL
        );
        // console.info('done obj', obj);
        resolve('done at ' + Date.now());
    })
}