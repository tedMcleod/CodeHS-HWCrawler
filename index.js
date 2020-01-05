#!/usr/bin/env node

const prompts = require('prompts'),
    validator = require('validator'),
    ora = require('ora'),
    chalk = require('chalk'),
    fs = require('fs'),
    path = require('path'),
    puppeteer = require('puppeteer'),
    format = require('string-format'),
    links = require('./templates/links'),
    pLimit = require('p-limit'),
    netLimit = pLimit(1),
    archiver = require('archiver'),
    os = require('os'),
    terminalLink = require('terminal-link');

let crypto, browser;
try {
    crypto = require('crypto');
} catch (err) {
    console.log('crypto support is required but is disabled!');
    process.exit(0);
}

// load settings
let sessionData = require('./settings.js'),
    arr_objs_classes = [];

let dateObjRN = new Date(), monthRN = dateObjRN.getMonth() + 1, dayRN = dateObjRN.getDate(),
    hourRN = dateObjRN.getHours(), minuteRN = dateObjRN.getMinutes(),
    yearRN = dateObjRN.getFullYear(),
    dateStrRN = yearRN + "/" + monthRN + "/" + dayRN + "/" + (hourRN <= 12 ? hourRN + "AM" : hourRN - 12 + "PM") + "/" + minuteRN;

/*
             _     _ _            _        _   _                   _     _                   _          ____ _        _             __ __                     __
 _ __  _   _| |__ | (_) ___   ___| |_ __ _| |_(_) ___  __   _____ (_) __| |  _ __ ___   __ _(_)_ __    / / _\ |_ _ __(_)_ __   __ _| _|_ |   __ _ _ __ __ _ __\ \
| '_ \| | | | '_ \| | |/ __| / __| __/ _` | __| |/ __| \ \ / / _ \| |/ _` | | '_ ` _ \ / _` | | '_ \  | |\ \| __| '__| | '_ \ / _` | | | |  / _` | '__/ _` / __| |
| |_) | |_| | |_) | | | (__  \__ \ || (_| | |_| | (__   \ V / (_) | | (_| | | | | | | | (_| | | | | | | |_\ \ |_| |  | | | | | (_| | | | | | (_| | | | (_| \__ \ |
| .__/ \__,_|_.__/|_|_|\___| |___/\__\__,_|\__|_|\___|   \_/ \___/|_|\__,_| |_| |_| |_|\__,_|_|_| |_| | |\__/\__|_|  |_|_| |_|\__, | | | |  \__,_|_|  \__, |___/ |
|_|                                                                                                    \_\                    |___/|__|__|            |___/   /_/

 */

(async () => {
    await startPuppeteer();

    if (savedCredsExist()) {
        await loadCredentialsPrompts();
        await testCredentials()
    } else {
        await setCredentialsPrompts();
        await testCredentials();
        await promptSavePwdOptions();
        await continueConfirmation().catch((quit) => doneSetupExit);
    }

    if (savedSectionsIDExist()) {
        await loadSavedSectionIDs();
    } else {
        await parseSectionIDs();
    }

    await promptAssignmentOptions();

    await assembleClassQueues();

    await promptSaveDataOptions();

    await parseWriteEachClassObj();

    await stopPuppeteer();

    printCompletionMessage();


    /*
          _    _ ______ _      _____  ______ _____   _____
         | |  | |  ____| |    |  __ \|  ____|  __ \ / ____|
         | |__| | |__  | |    | |__) | |__  | |__) | (___
         |  __  |  __| | |    |  ___/|  __| |  _  / \___ \
         | |  | | |____| |____| |    | |____| | \ \ ____) |
         |_|  |_|______|______|_|    |______|_|  \_\_____/

     */

    async function startPuppeteer() {
        browser = await puppeteer.launch({
            // headless: false //remove for production
        });
    }


    /* <!--- CodeHS Credentials Functions ---> */

    function savedCredsExist() {
        try {
            return fs.existsSync(path.join(__dirname, 'secrets', 'creds.json')) ? require('./secrets/creds.json').method != null && require('./secrets/creds.json').email : false;
        } catch (err) {
            return false;
        }
    }

    async function loadCredentialsPrompts() {
        let resizedIV = Buffer.allocUnsafe(16),
            iv = crypto
                .createHash("sha256")
                .update('doc says this could be null... it can\'t')
                .digest();
        iv.copy(resizedIV);

        let credJSON = require('./secrets/creds.json');
        let {method} = credJSON;
        sessionData.email = credJSON.email;
        if (method === 'none') {
            sessionData.password = credJSON.password || ' '
        } else if (method === 'pwd' || method === 'pin') {
            function cValidator(val) {
                if (method === 'pwd') {
                    return validator.isAlphanumeric(val + '');
                } else if (method === 'pin') {
                    return validator.matches(val + '', /\b\d{4}\b/);
                } else {
                    return false;
                }
            }

            const response = await prompts({
                type: 'password',
                name: 'pwd',
                message: `Enter your ${method === 'pwd' ? 'password' : 'pin'}`,
                validate: val => cValidator(val) ? true : `That could not be your ${method === 'pwd' ? 'password' : 'pin'}`
            });

            let {pwd} = response;
            let key = crypto.createHash('md5').update(pwd + '').digest();

            let decrypted, decryptCipher;
            try {
                decryptCipher = crypto.createDecipheriv('aes-128-cbc', key, resizedIV);
                decrypted = decryptCipher.update(Buffer.from(credJSON.password, 'hex'));
                decrypted = Buffer.concat([decrypted, decryptCipher.final()]);
            } catch (incorrect) {
                console.log(`${chalk.red(`Your ${method === 'pwd' ? 'password' : 'pin'} was incorrect... exiting...`)}`);
                process.exit();
            }

            sessionData.password = decrypted.toString();
        } else {
            console.info('Unknown save method, quitting...');
            process.exit();
        }
    }

    async function testCredentials() {
        return new Promise(async (resolve5, reject4) => {
            const spinner = ora({text: `${chalk.bold('Testing credentials...')}`}).start();

            const page = await browser.newPage();

            await loginCodeHS(page).then(async suc => {
                if (!fs.existsSync(path.join(__dirname, 'secrets', 'teacher.json'))) {
                    await writeFileAsync(path.join(__dirname, 'secrets', 'teacher.json'), JSON.stringify({teacherID: suc}));
                }
                spinner.succeed(`${chalk.bold('Login credentials valid')}`);
            }).catch(err => {
                spinner.fail(`${chalk.red('Login credentials invalid...')}`);
                codeHSCredInvalidExit();
            });

            resolve5(1);
        })
    }

    function codeHSCredInvalidExit() {
        console.info('Perhaps you changed your credentials on codehs.com?');
        process.exit();
    }

    async function setCredentialsPrompts() {
        sessionData = await prompts([
                {
                    type: 'text',
                    name: 'email',
                    message: 'What is your CodeHS email?',
                    validate: value => validator.isEmail(value + '') ? true : 'Enter a valid email'
                },
                {
                    type: 'password',
                    name: 'password',
                    message: 'What is your CodeHS password?',
                    validate: value => value.length > 0
                }
            ], {onCancel: onPromptsCancel}
        );
    }

    async function promptSavePwdOptions() {
        let resizedIV = Buffer.allocUnsafe(16),
            iv = crypto
                .createHash("sha256")
                .update('doc says this could be null... it can\'t')
                .digest();
        iv.copy(resizedIV);

        let saveData = await prompts([
            {
                type: 'confirm',
                name: 'save',
                message: 'Save credentials?'
            },
            {
                type: prev => prev ? 'select' : null,
                name: 'method',
                message: 'Security level:',
                choices: [
                    {
                        title: 'Pin', description: '4 Digits Code', value: 'pin',
                    },
                    {
                        title: 'Password', description: 'Alphanumerical (1+)', value: 'pwd',
                    },
                    {
                        title: 'None', description: 'No Security', value: 'none',
                    },
                    {
                        title: 'Cancel', description: 'Nvm, Don\'t Save!', value: 'cancel'
                    }
                ],
                hint: '- up/down to navigate. return to submit',
                initial: 0
            },
            {
                type: prev => prev === 'pin' ? 'password' : null,
                name: 'pin',
                message: 'Enter a 4-digit pin',
                validate: val => validator.matches(val + '', /\b\d{4}\b/)
            },
            {
                type: prev => prev === 'pwd' ? 'password' : null,
                name: 'pwd',
                message: 'Enter a password',
                validate: val => validator.isAlphanumeric(val + '')
            }
        ], {onCancel: onPromptsCancel});

        let {save} = saveData;

        if (save) {
            let {method} = saveData;

            let {email} = sessionData;
            let {password} = sessionData;

            if (method === 'none') {
                // no security or hash, move on !
            } else if (method === 'pin') {
                let {pin} = saveData;
                let key = crypto.createHash('md5').update(pin + '').digest();
                await prompts({
                    type: 'password',
                    name: 'tmp_confirm',
                    message: 'Confirm your pin',
                    validate: val => val === pin ? true : 'That\'s not your pin!'
                }, {onCancel: onPromptsCancel});
                let cryptoKey = crypto.createCipheriv('aes-128-cbc', key, resizedIV);
                password = cryptoKey.update(password, 'utf8', 'hex');
                password += cryptoKey.final('hex');
            } else if (method === 'pwd') {
                let {pwd} = saveData;
                let key = crypto.createHash('md5').update(pwd + '').digest();
                await prompts({
                    type: 'password',
                    name: 'tmp_confirm',
                    message: 'Confirm your password',
                    validate: val => val === pwd ? true : 'That\'s not your password!'
                }, {onCancel: onPromptsCancel});
                let cryptoKey = crypto.createCipheriv('aes-128-cbc', key, resizedIV);
                password = cryptoKey.update(password, 'utf8', 'hex');
                password += cryptoKey.final('hex');
            } else {
                // cancel
                process.exit();
            }

            //finally, write finalized email/password to file

            await writeFileAsync(path.join(__dirname, 'secrets', 'creds.json'), JSON.stringify({
                method: method,
                email: email,
                password: password
            }))
        }
    }

    async function continueConfirmation() {
        return new Promise(async (resolve, reject) => {
            const response = await prompts({
                type: 'confirm',
                name: 'tmp_confirm',
                message: 'Continue to generating class assignments data?'
            });

            let {tmp_confirm} = response;
            if (tmp_confirm) {
                resolve(1);
            } else {
                reject(0);
            }
        })
    }


    /* <!--- Assignments Table Cache Functions ---> */

    function savedSectionsIDExist() {
        try {
            return fs.existsSync(path.join(__dirname, 'secrets', 'sections.json'));
        } catch (err) {
            return false;
        }
    }

    async function loadSavedSectionIDs() {
        sessionData.sections = require('./secrets/sections.json');
    }

    async function parseSectionIDs() {
        const spinner = ora({text: `${chalk.bold('Parsing section IDs...')}`}).start();

        const pg = await browser.newPage();
        let teacherID;

        if (fs.existsSync(path.join(__dirname, 'secrets', 'teacher.json')) && require('./secrets/teacher.json') && require('./secrets/teacher.json').teacherID) {
            teacherID = require('./secrets/teacher.json').teacherID;
        } else {

            // just in case the login step was somehow skipped??
            // or corrupted data ig
            const response = await prompts({
                type: 'number',
                name: 'teacherID',
                message: 'Enter your teacherID (found in url after logging in)'
            });

            teacherID = response.teacherID;
        }

        await pg.goto(format(links.teachersPage, teacherID), {waitUntil: 'networkidle2'});

        // make this part optional (could be manual) b/c not everyone has same naming formats
        let sections = await pg.evaluate(() => {
            let tmp_arr_secs = document.getElementsByClassName('teachercourse-header');

            let sections = {};

            for (let i = 0; i < tmp_arr_secs.length; i++) {
                let container = tmp_arr_secs[i].getElementsByClassName('course-title')[0];

                let name = container.innerHTML.toString().trim().substring(0, container.innerHTML.toString().trim().indexOf(' '));
                // console.info(name);
                let tmp_id_split = container.href.toString().split('/');
                let teacherURL = tmp_id_split[tmp_id_split.length - 1];
                let selectors = document.querySelectorAll('[data-teacher-course-id="' + teacherURL + '"]');
                let teacherObj = {
                    id: teacherURL
                };
                let classesObj = {};
                for (let j = 0; j < selectors.length; j++) {
                    let name = selectors[j].getAttribute('data-dropdown-section-name');
                    let classNum = name.substring(1, name.indexOf(' '));
                    classesObj[classNum + ''] = selectors[j].getAttribute('data-class-id');
                }
                teacherObj.classes = classesObj;
                sections[name + ''] = teacherObj;
            }

            return sections;
        });

        // console.info(sections);
        await writeFileAsync(path.join(__dirname, 'secrets', 'sections.json'), JSON.stringify(sections));

        sessionData.sections = sections;

        await pg.close();

        spinner.succeed(`${chalk.bold('Section IDs saved in ./secrets/sections.json')}`);
    }


    /* <!--- CodeHS Parse Configuration Functions ---> */

    async function promptAssignmentOptions() {
        return new Promise(async (resolve, reject) => {
            const response = await prompts([
                    {
                        type: 'list',
                        name: 'arr_assignments',
                        message: `Enter exercise names (separated by ${chalk.bold(',')})`,
                        initial: '',
                        separator: ',',
                        validate: val => val.toString().length > 0 ? true : 'Enter at least one exercise!'
                    },
                    {
                        type: 'date',
                        name: 'date_dueDate',
                        message: 'When is this assignment due?',
                        initial: new Date(yearRN, monthRN - 1, dayRN, 23, 59),
                        mask: 'YYYY-MM-DD HH:mm'
                    },
                    {
                        type: 'multiselect',
                        name: 'arr_classes',
                        message: 'Pick which classes to grade',
                        choices: buildOptions(),
                        min: 1,
                        hint: '- Space to select. Return to submit',
                        instructions: false
                    }
                ]
            );

            sessionData['date_dueDate'] = response['date_dueDate'];
            sessionData['arr_assignments'] = response['arr_assignments'];
            sessionData['arr_classes'] = response['arr_classes'];

            resolve('i');

            function buildOptions() {
                let options = [];
                let {sections} = sessionData;
                for (let key in sections) {
                    if (sections.hasOwnProperty(key)) {
                        options.push({
                            title: `All ${key} Classes`, value: `${key}|0`
                        })
                    }
                }

                //run for-loop again to preserve ordering
                for (let key in sections) {
                    if (sections.hasOwnProperty(key)) {

                        //'...' deconstructs the mapped array into the options array
                        options.push(...Object.keys(sections[key].classes).map(pNum => {
                            return {
                                title: `P${pNum} ${key}`, value: `${key}|${pNum}`
                            }
                        }));
                    }
                }
                return options;
            }
        });
    }

    async function assembleClassQueues() {
        return new Promise((resolve, reject) => {
            const spinner = ora({text: `${chalk.bold('Assembling parsing queue')}`}).start();

            let {arr_classes} = sessionData;
            let {sections} = sessionData;

            let arr_completed = [];
            arr_classes.forEach(obj => {
                let teacherName = obj.split('|')[0];
                let classIdentifier = obj.split('|')[1];
                if (classIdentifier === '0') {
                    arr_completed.push(teacherName);
                    for (let classNum in sections[teacherName].classes) {
                        if (!sections[teacherName].classes.hasOwnProperty(classNum)) continue;
                        let obj_todo = {
                            teacherName: teacherName,
                            url: format(links.homePage, sections[teacherName].id, sections[teacherName].classes[classNum]),
                            classNum: classNum,
                            sectionId: sections[teacherName].id,
                            classId: sections[teacherName].classes[classNum],
                            students: []
                        };
                        arr_objs_classes.push(obj_todo);
                    }
                } else {
                    if (!arr_completed.includes(teacherName)) {
                        let obj_todo = {
                            teacherName: teacherName,
                            url: format(links.homePage, sections[teacherName].id, sections[teacherName].classes[classIdentifier]),
                            classNum: classIdentifier,
                            sectionId: sections[teacherName].id,
                            classId: sections[teacherName].classes[classIdentifier],
                            students: []
                        };
                        arr_objs_classes.push(obj_todo);
                    }
                }
            });
            spinner.succeed(`${chalk.bold('Parse queue assembled')}`);
            resolve(1);
        })
    }


    /* <!--- File Writing Configuration Functions ---> */

    async function promptSaveDataOptions() {
        const response = await prompts({
            type: 'multiselect',
            name: 'chosenOptions',
            message: 'Download what?',
            choices: [
                {title: 'Student\'s score', value: 'score', selected: true},
                {title: 'Student\'s code', value: 'code', selected: true},
                {title: 'Student\'s coding history', value: 'history', selected: false}
            ],
            min: 1,
            hint: '- Space to select. Return to submit',
            instructions: false
        });

        sessionData['downloadOptions'] = response.chosenOptions;
    }

    async function parseWriteEachClassObj() {
        await Promise.all(arr_objs_classes.map((obj) => {
            return netLimit(() => combinedSteps(obj))
        }));
    }

    async function combinedSteps(classObj) {
        return new Promise(async (a, b) => {
            const spinner = ora({text: `${chalk.bold(`[${classObj.teacherName + '_P' + classObj.classNum}] Preparing...`)}`}).start();

            await parseClassPages(classObj, arr_objs_classes, browser, spinner);
            spinner.text = `${chalk.bold(`[${classObj.teacherName + '_P' + classObj.classNum}] Writing files...`)}`;

            await writeClass(classObj);
            spinner.succeed(chalk.bold(path.join(sessionData.outDirectory, '----temp----', classObj.teacherName + '_P' + classObj.classNum).replace('----temp----', '~')));
            a(Date.now());
        })
    }

    async function parseClassPages(obj, arr_objs_classes, browser, spinner) {
        return new Promise(async (resolve, reject) => {
            // TOP OF FUNCTION
            let {date_dueDate, arr_assignments, downloadOptions} = sessionData;
            const page = await browser.newPage();
            const headlessUserAgent = await page.evaluate(() => navigator.userAgent);
            const chromeUserAgent = headlessUserAgent.replace('HeadlessChrome', 'Chrome');
            await page.setUserAgent(chromeUserAgent);
            await page.setExtraHTTPHeaders({
                'accept-language': 'en-US,en;q=0.8'
            });
            let cached_modulePath = path.join(__dirname, 'cached', obj.sectionId + '', obj.classId + '');
            let url_sectionAllModule = format('https://codehs.com/lms/assignments/{0}/section/{1}/progress/module/0', obj.sectionId, obj.classId);

            async function pathExists(path) {
                return new Promise((resolve1, reject1) => {
                    if (fs.existsSync(path)) {
                        resolve1(true);
                    } else {
                        reject1(false);
                    }
                });
            }

            let boolean_useCache = true;
            let boolean_buildCache = false;
            let {rebuildCache: forceCache} = sessionData;
            if (typeof forceCache !== "boolean") {
                errorExit('settings.js \'rebuildCache\'invalid, not a boolean');
            }


            await pathExists(path.join(cached_modulePath, 'index.html')).then(success => {
                //use cache
                if (forceCache) {
                    boolean_useCache = false;
                    boolean_buildCache = true;
                } else {
                    url_sectionAllModule = `file:${path.join(cached_modulePath, 'index.html')}`;
                }
            }).catch(err => {
                boolean_useCache = false;
                boolean_buildCache = true;
            });

            let pageGoOptions = {
                waitUntil: 'networkidle2',
                timeout: 0
            };
            // console.info(url_sectionAllModule);
            spinner.text = chalk.bold(`[${obj.teacherName + '_P' + obj.classNum}] Preparing... (Loading all assignments and IDs)`);
            await page.goto(url_sectionAllModule, pageGoOptions).catch(errObj => {
                if (errObj.name !== 'TimeoutError') {
                    console.info(os.EOL + chalk.bold.red('Unknown error: ', errObj));
                    console.info(chalk.bold.yellow('Please open an issue in this ' + terminalLink('repo', 'https://github.com/e-zhang09/CodeHS-HWCrawler')));
                    process.exit();
                }
            });
            await page.waitForSelector('#activity-progress-table', {visible: true, timeout: 0});

            if (boolean_buildCache) {
                if (forceCache) {
                    spinner.text = chalk.bold(`[${obj.teacherName + '_P' + obj.classNum}] Rebuilding Cache... (May take up to 5 minutes)`);
                } else {
                    spinner.text = chalk.bold(`[${obj.teacherName + '_P' + obj.classNum}] Preparing... (First run may take up to 5 minutes)`);
                }
                let bodyHTML = await page.evaluate(() => document.body.innerHTML);
                await writeFileAsync(path.join(cached_modulePath, 'index.html'), bodyHTML);
            }

            // duplicate assignments
            let arr_assignmentsCopy = arr_assignments.slice();

            page.on('console', consoleObj => {
                // Remove on prod, info is more or less for debug only
                // if (consoleObj.text().includes('[ainfo]')) {
                //     console.log(consoleObj.text().replace('[ainfo]', ''))
                // }
                if (consoleObj.text().includes('[awarning]')) {
                    console.log(chalk.yellow.bold(consoleObj.text().replace('[awarning]', '')))
                }
                if (consoleObj.text().includes('[aerror]')) {
                    console.log(chalk.red.bold(consoleObj.text().replace('[aerror]', '')));
                    process.exit();
                }
            });
            let [arr_assignmentIDs, arr_obj_students] = await page.evaluate(async (arr_assignmentsCopy) => {
                function sleep(ms) {
                    return new Promise(resolution => setTimeout(resolution, ms));
                }

                // console.info('[ainfo] arr_assignmentsCopy', JSON.stringify(arr_assignmentsCopy, null, 4));

                let originalLength = arr_assignmentsCopy.length;

                let arr_IDs = [];
                let children_possibleNodes = document.getElementsByClassName('activity-item');
                for (let i = 0; i < children_possibleNodes.length; i++) {
                    if (children_possibleNodes[i].getAttribute('data-original-title')) {
                        let str = children_possibleNodes[i].getAttribute('data-original-title').toLowerCase();
                        str = str.slice(0, str.lastIndexOf(":")); //remove the status that follows the problem name

                        for (let j = 0; j < arr_assignmentsCopy.length; j++) {
                            if (str.toLowerCase().trim() === arr_assignmentsCopy[j].toLowerCase()) {
                                //assignments are already trimmed from prompts
                                //got one assignment
                                arr_IDs.push({
                                    name: arr_assignmentsCopy[j],
                                    url: children_possibleNodes[i].children[0].href
                                });

                                //remove 'assignment' name from to-search list
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

                // console.info('[ainfo] arr_assignmentsCopy', JSON.stringify(arr_assignmentsCopy, null, 4));
                if (arr_assignmentsCopy.length === originalLength) {
                    console.log('[aerror]', 'The following assignments were not found: ' + JSON.stringify(arr_assignmentsCopy))
                } else if (arr_assignmentsCopy.length !== 0) {
                    console.log('[awarning]', 'The following assignments were not found: ' + JSON.stringify(arr_assignmentsCopy) + ', proceeding with the other problems in 5 seconds...')
                    await sleep(5000);
                }

                let arr_obj_students = [];
                let table = document.getElementById('activity-progress-table').children[0].getElementsByClassName('student-row');

                console.info('numStudents', table.length);
                for (let i = 0; i < table.length; i++) {
                    let student_firstName = table[i].getAttribute('data-first-name').toString();
                    let student_lastName = table[i].getAttribute('data-last-name').toString();
                    let obj_student = {
                        firstName: student_firstName,
                        lastName: student_lastName,
                        assignments: {}
                    };

                    let candidate_assignments = table[i].getElementsByClassName('progress-circle');
                    // console.info('num student-link candidates', candidate_assignments.length);
                    for (let j = 0; j < candidate_assignments.length; j++) {
                        let refStr = candidate_assignments[j].href;
                        let refStrComponents = refStr.split('/');
                        if (refStr && refStrComponents.length >= 4) {
                            refStrComponents.slice().some(str => {
                                if (str.toString().trim().length >= 3) {
                                    if (!str.match(/[a-zA-Z:]/g)) {
                                        //to parse it even if from cache
                                        obj_student.id = str;
                                        // console.info('got student id', str);
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

            let rosterPage;
            if (boolean_useCache) {
                rosterPage = await browser.newPage();
                await rosterPage.goto('https://codehs.com');
            } else {
                rosterPage = page;
            }

            spinner.text = chalk.bold(`[${obj.teacherName + '_P' + obj.classNum}] Downloading Student Emails...`);
            let obj_studentEmail = await rosterPage.evaluate(async (TEMPLATE_ROSTER_URL, obj) => {
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

                let obj_studentEmail = {};

                //get student emails
                //TODO: Could cache but not necessary because response loads fast
                function fetchStudentEmails() {
                    return new Promise((resolve1, reject1) => {
                        let emailRequest = new XMLHttpRequest();
                        emailRequest.onload = function () {
                            resolve1(this.responseXML);
                        };
                        emailRequest.open("GET", String.format(TEMPLATE_ROSTER_URL, obj.classId));
                        emailRequest.responseType = "document";
                        emailRequest.send();
                    });
                }

                let rosterDocument = await fetchStudentEmails();
                let tmp_table = rosterDocument.getElementById('classset-progress');
                let rosterTable = tmp_table.getElementsByTagName('table')[0];
                let rosterRows = rosterTable.getElementsByTagName('tr');
                for (let i = 0; i < rosterRows.length; i++) {
                    let row = rosterRows[i];
                    if (row.getElementsByTagName('a').length === 0) {
                        continue;
                    }
                    let studentName = row.getElementsByTagName('a')[0].innerText.trim();
                    let studentEmail = 'none';
                    let tds = row.getElementsByTagName('td');
                    for (let j = 0; j < tds.length; j++) {
                        if (tds[j].innerText.includes('@student')) {
                            studentEmail = tds[j].innerText;
                        }
                    }
                    obj_studentEmail[studentName] = studentEmail;
                }

                return obj_studentEmail;
            }, links.rosterPage, obj);
            if (boolean_useCache) rosterPage.close();

            for (let i = 0; i < arr_assignmentIDs.length; i++) {
                let temp_split = arr_assignmentIDs[i].url.substr(8).split('/');
                arr_assignmentIDs[i] = temp_split[6];
            }

            //need to move to codehs.com for cors
            if (boolean_useCache) await page.goto('https://www.codehs.com');

            //update spinner
            spinner.text = chalk.bold(`[${obj.teacherName + '_P' + obj.classNum}] Calculating Student Grades...`);

            //attach bottleneckJS to limit network calls
            await pathExists(path.join(__dirname, 'node_modules', 'bottleneck', 'es5.js')).then(async suc => {
                await page.addScriptTag({path: path.join(__dirname, 'node_modules', 'bottleneck', 'es5.js')});
            }).catch(async err => {
                await pathExists(path.join(__dirname, '..', '..', 'node_modules', 'bottleneck', 'es5.js')).then(async suc => {
                    await page.addScriptTag({path: path.join(__dirname, '..', '..', 'node_modules', 'bottleneck', 'es5.js')});
                }).catch(err => {
                    console.info(chalk.bold.red('Could not find the \'bottleneck\' module'));
                    process.exit();
                })
            });

            //calculate student grades
            obj.students = await page.evaluate(
                async (arr_assignmentIDs, obj, TEMPLATE_STUDENT_URL, date_dueDate, arr_obj_students, downloadCode, obj_studentEmail) => {
                    //import bottleneck from script tag
                    let Bottleneck = window.Bottleneck;
                    const limiter = new Bottleneck({
                        maxConcurrent: 10,
                        minTime: 200
                    });

                    function getCookie(name) {
                        let value = "; " + document.cookie;
                        let parts = value.split("; " + name + "=");
                        if (parts.length === 2) return parts.pop().split(";").shift();
                        return '';
                    }

                    let csrfToken = getCookie('csrftoken');

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

                    // limits to one student for testing
                    // arr_obj_students = arr_obj_students.splice(arr_obj_students.length - 1); // Delete this for prod

                    // limits to first student
                    // arr_obj_students = [arr_obj_students[0]]; // Delete this for prod

                    console.info('fetching student pages', arr_obj_students);

                    // fetch date from students' page
                    await Promise.all(arr_obj_students.map(async (studentObject) => {
                        // console.info('processing', studentObject);
                        await limiter.schedule(() => {
                            const allTasks = arr_assignmentIDs.map(async (key) => {
                                return new Promise((res, rej) => {
                                    let xhr = new XMLHttpRequest();
                                    xhr.onload = async function () {
                                        let document = this.responseXML;

                                        //get problem name
                                        let problemName = document.title.split('|')[0].trim();

                                        //get first try date/time
                                        let startedText;
                                        try {
                                            startedText = document.getElementById('started-time').getElementsByClassName('msg-content')[0].getElementsByTagName('p')[0].innerText;
                                        } catch (err) {
                                            studentObject.email = obj_studentEmail[studentObject.firstName + ' ' + studentObject.lastName];
                                            console.info('[ainfo] email ' + studentObject.email);
                                            studentObject.assignments['' + key] = {
                                                problemName: problemName.includes('201') ? '--Problem Removed--' : problemName,
                                                firstTryDate: '--',
                                                firstTryTime: '--',
                                                timeWorkedBeforeDue: '--',
                                                timeWorkedTotal: '--',
                                                onTimeStatus: '--',
                                                problemStatus: 'Problem Removed',
                                                pointsAwarded: '--',
                                                maxPoints: '--',
                                                studentCodes: [{
                                                    submissionTime: '--',
                                                    code: null,
                                                    ID: '--'
                                                }],
                                                numberOfVersions: '--',
                                                numberOfSessions: '--'
                                            };

                                            await sleep(10000); // wait ten seconds before messing up

                                            res(1);
                                        }
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

                                        // get time worked
                                        let selectionField = document.getElementById('assignment-submission-select');

                                        let submitted = false;
                                        let late = false;
                                        if (selectionField != null) {
                                            submitted = true;
                                            let submissions = selectionField.getElementsByTagName('option');
                                            for (let i = 0; i < submissions.length; i++) {
                                                let date_submissionDate = new Date(submissions[i].innerText.substring(0, submissions[i].innerText.length - 4));
                                                date_submissionDate.setFullYear(2020);
                                                if (date_submissionDate > new Date()) {
                                                    date_submissionDate.setFullYear(2019)
                                                }
                                                //attach date 'hours' modifier
                                                Date.prototype.addHours = function (h) {
                                                    this.setTime(this.getTime() + (h * 60 * 60 * 1000));
                                                    return this;
                                                };
                                                if (submissions[i].innerText.includes('p.m.')) {
                                                    date_submissionDate.addHours(12);
                                                }
                                                if (date_submissionDate > date_dueDate) {
                                                    late = true;
                                                }
                                            }
                                        }

                                        //get some user information from assignment document
                                        let temp_itemUserURL = document.getElementById('print-code').href;
                                        let temp_split = temp_itemUserURL.split('/');
                                        let item = temp_split[5];
                                        let user = temp_split[6];

                                        //Time spent on assignment
                                        let runningTotalSeconds = 0;
                                        let beforeDue;

                                        let numVersions = 0;
                                        let numSesh = 1;

                                        //holds all of a student's code
                                        let arr_obj_studentCodes = [];
                                        await getSnapshotsAsync().then(docText => {
                                            function htmlToElement(html) {
                                                let div = document.createElement('div');
                                                html = html.trim(); // Never return a text node of whitespace as the result
                                                div.innerHTML = html;
                                                return div;
                                            }

                                            let editContainers = htmlToElement(docText).getElementsByClassName('snapshot-version');
                                            let previousDate;

                                            if (!String.prototype.splice) {
                                                String.prototype.splice = function (idx, rem, str) {
                                                    return this.slice(0, idx) + str + this.slice(idx + Math.abs(rem));
                                                };
                                            }

                                            numVersions = editContainers.length;
                                            for (let i = 0; i < editContainers.length; i++) {
                                                let dateStr = editContainers[i].getElementsByClassName('date')[0].innerHTML;
                                                let timeStr = editContainers[i].getElementsByClassName('time')[0].innerHTML;

                                                if (!timeStr.includes(':')) {
                                                    timeStr = timeStr.trim();
                                                    timeStr = timeStr.splice(timeStr.length - 3, 0, ':00');
                                                }

                                                let combinedStr = dateStr + ' ' + timeStr;
                                                // console.info('combinedStr', combinedStr);
                                                let date_editDate = new Date(combinedStr);
                                                if (!previousDate) previousDate = date_editDate;
                                                // console.info('is nan', isNaN(+date_editDate));

                                                let rawCodeObj = editContainers[i].getElementsByTagName('script')[0].text;
                                                let code = JSON.parse(rawCodeObj)['default.js'];
                                                try {
                                                    arr_obj_studentCodes.push({
                                                        editTime: date_editDate.toISOString(),
                                                        code: code
                                                    });
                                                } catch (pushError) {
                                                    console.info('pushError', pushError);
                                                }

                                                if (!beforeDue && date_editDate > date_dueDate) {
                                                    beforeDue = runningTotalSeconds;
                                                    return;
                                                }

                                                let deltaTime = (previousDate - date_editDate) / 1000; //in seconds
                                                if (deltaTime > 30 * 60) { // time elapsed > 30 mins?
                                                    numSesh++;
                                                } else {
                                                    runningTotalSeconds += deltaTime;
                                                }

                                                previousDate = date_editDate; //update prev to rn
                                            }


                                        }).catch(err => {
                                            console.error(err);
                                            //ignore
                                        });

                                        if (!beforeDue) {
                                            beforeDue = runningTotalSeconds;
                                        }

                                        function getSnapshotsAsync() {
                                            return new Promise(function (resolve2, reject2) {
                                                let xmlhr = new XMLHttpRequest();
                                                xmlhr.onreadystatechange = function () {
                                                    if (this.readyState === 4) {
                                                        if (this.status === 200) {
                                                            resolve2(JSON.parse(this.responseText).text);
                                                        } else {
                                                            reject2(this.status);
                                                        }
                                                    }
                                                };
                                                xmlhr.open("POST", "https://codehs.com/editor/ajax/get_snapshots", true);
                                                xmlhr.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
                                                xmlhr.setRequestHeader('x-requested-with', 'XMLHttpRequest');
                                                xmlhr.setRequestHeader('x-csrftoken', csrfToken);
                                                xmlhr.send(`item=${item}&user=${user}&course=0&method=get_snapshots`);
                                            });
                                        }

                                        studentObject.email = obj_studentEmail[studentObject.firstName + ' ' + studentObject.lastName];
                                        console.info('[ainfo] student email', studentObject.email);
                                        studentObject.assignments['' + key] = {
                                            problemName: problemName,
                                            firstTryDate: firstTryDate,
                                            firstTryTime: firstTryTime,
                                            timeWorkedBeforeDue: beforeDue / 60,
                                            timeWorkedTotal: runningTotalSeconds / 60,
                                            onTimeStatus: submitted ? (late ? 'late' : 'on time') : 'not submitted',
                                            problemStatus: problemStatus,
                                            pointsAwarded: 0,
                                            maxPoints: 1,
                                            studentCodes: arr_obj_studentCodes,
                                            numberOfVersions: numVersions,
                                            numberOfSessions: numSesh
                                        };

                                        res(1);
                                    };

                                    xhr.open("GET", String.format(TEMPLATE_STUDENT_URL, studentObject.id, obj.classId, key));
                                    xhr.responseType = "document";
                                    xhr.send();
                                })
                            });
                            return Promise.all(allTasks);
                        });

                        //calculate points to award for each exercise
                        console.info(studentObject);
                        let {assignments} = studentObject;

                        let totalTimeWorked = 0;
                        let totalPoints = 0;
                        let arr_assignmentsKeys = Object.keys(assignments);
                        let isAllSubmitted = true;
                        arr_assignmentsKeys.forEach(key => {
                            totalTimeWorked += assignments[key].timeWorkedTotal ? assignments[key].timeWorkedTotal : 0;
                            let {problemStatus} = assignments[key];
                            if (problemStatus.includes('Not Submitted') || problemStatus.includes('Unopened')) {
                                isAllSubmitted = false;
                            }
                        });

                        let numExercises = arr_assignmentsKeys.length;
                        if (totalTimeWorked >= 45 || isAllSubmitted) {
                            //award full points to each exercise
                            arr_assignmentsKeys.forEach(key => {
                                assignments[key].pointsAwarded = 1;
                                totalPoints += assignments[key].pointsAwarded;
                            });
                        } else {
                            arr_assignmentsKeys.forEach(key => {
                                let {timeWorkedTotal} = assignments[key];
                                if (timeWorkedTotal >= 45 / numExercises) {
                                    assignments[key].pointsAwarded = 1;
                                } else if (timeWorkedTotal >= 45 / (numExercises * 3)) {
                                    assignments[key].pointsAwarded = Math.round(timeWorkedTotal / (45 / numExercises) * 100) / 100;
                                } else {
                                    assignments[key].pointsAwarded = 0;
                                }
                                totalPoints += assignments[key].pointsAwarded;
                            });
                        }

                        //append total total time worked to student
                        studentObject.timeSpentTotal = totalTimeWorked;

                        studentObject.totalPoints = Math.round(totalPoints / numExercises * 10 * 100) / 100;
                    }));

                    return arr_obj_students;

                    function sleep(ms) {
                        return new Promise(resolution => setTimeout(resolution, ms));
                    }
                }, arr_assignmentIDs, obj, links.studentURL, date_dueDate, arr_obj_students, downloadOptions.includes('code'), obj_studentEmail
            );

            await page.close();
            resolve('done at ' + Date.now());
            //BOTTOM OF FUNCTION
        })
    }

    function writeClass(classObj) {
        return new Promise(async (re, reje) => {
            let {downloadOptions} = sessionData;
            let writeQueue = [];
            if (downloadOptions.includes('score')) {
                writeQueue.push(writeStudentGrades(classObj));
            }
            if (downloadOptions.includes('code')) {
                writeQueue.push(writeStudentCodes(classObj, true));
            }
            if (downloadOptions.includes('history')) {
                writeQueue.push(writeStudentCodes(classObj, false));
            }
            await Promise.all(writeQueue).catch(err => {
                reje(err);
            });
            re('ok');
        });
    }

    async function writeStudentGrades(classObj) {
        return new Promise(async (re, reje) => {
            let {date_dueDate, outDirectory} = sessionData;
            let content_rows = [];
            let headers = ['Name', 'Period', 'E-mail'];

            let outPath = path.join(outDirectory, 'grades', `${classObj.teacherName}_P${classObj.classNum}`);

            //sessionData.arr_assignments is unreliable because actual assignment list may be changed
            // console.info(classObj.students[0].assignments);
            let assignmentsStr = '';
            Object.keys(classObj.students[0].assignments).forEach(assignmentKey => {
                let assignmentName = classObj.students[0].assignments[assignmentKey].problemName;
                // console.info('assignmentName' , assignmentName);
                headers.push('Problem', 'Due', 'First Try', 'First Time', 'Time Worked By Due Date', 'Total Time Worked', 'On Time Status', 'Problem Status', 'Points', 'Number of Versions', 'Number of Sessions');
                outPath += safePathComponent(assignmentName.toString().replaceAll(' ', '-') + ' ');
            });
            outPath = path.join(outPath, assignmentsStr).trim().replaceAll(' ', '_') + '_' + dateStrRN.replaceAll('/', '-') + '.csv';
            headers.push('Total Points Awarded', 'Total Points Possible', 'On Time?', 'Total Time On Assignment');
            content_rows.push(headers);
            classObj.students.forEach(studentObj => {
                let studentRow = [];
                studentRow.push('"' + studentObj.lastName + ', ' + studentObj.firstName + '"');
                studentRow.push(classObj.classNum);
                studentRow.push(studentObj.email);

                Number.prototype.padLeft = function (base, chr) {
                    let len = (String(base || 10).length - String(this).length) + 1;
                    return len > 0 ? new Array(len).join(chr || '0') + this : this;
                };

                let overAllOnTime = true;
                let started = false;

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
                    studentRow.push(studentObj.assignments[assignmentIDs].timeWorkedBeforeDue.toString().minsToHHMMSS());
                    studentRow.push(studentObj.assignments[assignmentIDs].timeWorkedTotal.toString().minsToHHMMSS());
                    studentRow.push(studentObj.assignments[assignmentIDs].onTimeStatus);
                    if (!studentObj.assignments[assignmentIDs].onTimeStatus.includes('on time')) {
                        overAllOnTime = false;
                    }
                    if (!studentObj.assignments[assignmentIDs].onTimeStatus.includes('not submitted')) {
                        started = true;
                    }
                    studentRow.push(studentObj.assignments[assignmentIDs].problemStatus);
                    studentRow.push(studentObj.assignments[assignmentIDs].pointsAwarded);
                    studentRow.push(studentObj.assignments[assignmentIDs].numberOfVersions);
                    studentRow.push(studentObj.assignments[assignmentIDs].numberOfSessions);
                });

                studentRow.push(studentObj.totalPoints);
                studentRow.push(10);
                studentRow.push(overAllOnTime ? 'on time' : (started ? 'late' : 'not started'));
                studentRow.push(studentObj.timeSpentTotal);
                content_rows.push(studentRow);
            });
            let csvContent = content_rows.map(e => e.join(",")).join("\n");

            await writeFileAsync(outPath, csvContent).then(resultS => re(classObj.teacherName + '_P' + classObj.classNum)).catch(errors => reje(errors));
            re('aaaaa');
        })
    }

    async function writeStudentCodes(classObj, justMostRecent) {
        return new Promise(async (resolve, reject) => {
            let {arr_assignments, outDirectory, rmFormatChars} = sessionData;
            if (typeof rmFormatChars !== 'boolean') {
                errorExit('settings.js \'rmFormatChars\' invalid, not a boolean');
            }
            let {teacherName, classNum} = classObj;
            let outPath = path.join(outDirectory, justMostRecent ? 'code' : 'code_history', `${teacherName}_P${classNum}`);

            if (justMostRecent) {
                let writeQueue = [];
                classObj.students.forEach(studentObj => {
                    let studentIdentifier = `P${classNum}_${studentObj.firstName}-${studentObj.lastName}_${studentObj.id}`;
                    Object.keys(studentObj.assignments).forEach(assignmentIDs => {
                        let assignmentName = studentObj.assignments[assignmentIDs + ''].problemName;
                        if (!assignmentName.includes('--Problem Removed--')) {
                            let folderPath = path.join(outPath, safePathComponent(assignmentName.replace(/ /g, '_')));
                            let codes = studentObj.assignments[assignmentIDs + ''].studentCodes;
                            if (codes.length > 0 && codes[0].code !== null) {
                                if (rmFormatChars) {
                                    writeQueue.push(writeFileAsync(path.join(folderPath, studentIdentifier + '.js'), removeFormattingCharacters(codes[0].code)));
                                } else {
                                    writeQueue.push(writeFileAsync(path.join(folderPath, studentIdentifier + '.js'), codes[0].code));
                                }
                            }
                        }
                    });
                });
                await Promise.all(writeQueue).catch(err => reject(err));
                resolve(1);
            } else {
                let assignmentsString = '';
                arr_assignments.forEach(assignmentName => {
                    assignmentsString += safePathComponent(assignmentName.toString().replaceAll(' ', '-') + ' ');
                });
                outPath = path.join(outPath, assignmentsString).trim().replaceAll(' ', '_') + '_' + dateStrRN.replaceAll('/', '-') + '.zip';
                ensureDirectoryExistence(outPath);

                let outFile = fs.createWriteStream(outPath);
                let archive = archiver('zip', {
                    zlib: {level: 9} // Sets the compression level.
                });

                archive.pipe(outFile);

                classObj.students.forEach(studentObj => {
                    let studentIdentifier = `P${classNum}_${studentObj.firstName}-${studentObj.lastName}_${studentObj.id}`;
                    Object.keys(studentObj.assignments).forEach(assignmentIDs => {
                        studentObj.assignments[assignmentIDs + ''].studentCodes.forEach(submissionObject => {
                            if (submissionObject.code !== null) {
                                if(rmFormatChars){
                                    archive.append(removeFormattingCharacters(submissionObject.code), {name: `${studentIdentifier}_${encodeURIComponent(submissionObject.editTime)}.js`});
                                }else{
                                    archive.append(submissionObject.code, {name: `${studentIdentifier}_${encodeURIComponent(submissionObject.editTime)}.js`});
                                }
                            }
                        })
                    });
                });

                archive.finalize();

                outFile.on('close', () => resolve(`${outPath} is done`));
                archive.on('error', (err) => reject(err));
            }
        });
    }

    function safePathComponent(path) {
        return path.replace(/[<>:"//\\\|\?\*]/g,'');
    }

    function doneSetupExit() {
        console.info(`That\'s alright, ${chalk.bold('codehs_grades or npm start index.js')} to run again!`);
        process.exit();
    }

    async function stopPuppeteer() {
        try {
            await browser.close();
        } catch (e) {
            // oop
        } finally {
            await browser.close();
        }
    }

    function printCompletionMessage() {
        console.log();
        console.info(`${chalk.bold('Parsing has been completed.')}`);
        console.info(`${chalk.bold(`Any suggestions? Open an issue in this ${terminalLink('repo', 'https://github.com/e-zhang09/CodeHS-HWCrawler')}`)}`);
        process.exit();
    }

    /* <!--- Miscellaneous Functions ---> */

    function loginCodeHS(pg) {
        return new Promise(async (resolve, reject) => {
            // resolve('assume credentials are correct'); //remove on prod
            let warningsLength;
            let teacherID;
            try {
                await pg.goto('https://codehs.com/login', {waitUntil: 'networkidle2'});

                const EMAIL_SELECTOR = '#login-email';
                const PASSWORD_SELECTOR = '#login-password';
                const BUTTON_SELECTOR = '#login-submit';

                await pg.click(EMAIL_SELECTOR);
                await pg.keyboard.type(sessionData['email']);

                await pg.click(PASSWORD_SELECTOR);
                await pg.keyboard.type(sessionData['password']);

                await pg.click(BUTTON_SELECTOR);

                await pg.waitForNavigation();

                teacherID = await pg.evaluate(() => {
                    let urlSplit = window.location.href.toString().split('/');
                    return urlSplit[urlSplit.length - 1];
                });

                warningsLength = await pg.evaluate(() => {
                    return document.getElementsByClassName('form-alert-red').length;
                });

                await pg.close();
            } catch (e) {
                if (e.toString().includes('net::ERR_NAME_NOT_RESOLVED')) {
                    console.log(chalk.bold.red(os.EOL + 'Are you connected to the internet?' + os.EOL + 'Perhaps there is a DNS issue.'));
                    process.exit();
                }
                reject(-1);
            }
            if (warningsLength === 0) {
                resolve(teacherID);
            } else {
                reject(warningsLength);
            }
        });
    }

    function onPromptsCancel(prompt) {
        console.log(`${chalk.red('Canceling session')}`);
        process.exit();
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function writeFileAsync(path, content) {
        return new Promise((resolve, reject) => {
            if (path.indexOf(':') && path.lastIndexOf(':') !== path.indexOf(':')) {
                //colons (:) may affect the directory resolutions of OSes differently...
                //replace all colon but the first colon in the meantime.
                path = path.substring(0, path.indexOf(':') + 1) + path.substring(path.indexOf(':') + 1).replace(/:/g, '--');
            }
            // test path
            // console.info(`${os.EOL}${path}`);
            ensureDirectoryExistence(path);
            fs.writeFile(path, content, function (err) {
                if (err) {
                    reject(err);
                } else {
                    resolve('ok');
                }
            })
        });
    }

    function ensureDirectoryExistence(filePath) {
        let dirname = path.dirname(filePath);
        if (fs.existsSync(dirname)) {
            return true;
        }
        ensureDirectoryExistence(dirname);
        fs.mkdirSync(dirname);
    }

    function errorExit(error) {
        console.log(chalk.red.bold("\t" + error));
        process.exit();
    }

    function removeFormattingCharacters(str) {
        return str.replace(/(\\r\\n|\\n|\\r|\\t)/g, ' ').replace(/ {2,}/g, '');
    }
})();

String.prototype.replaceAll = function (search, replacement) {
    return this.split(search).join(replacement);
};

String.prototype.minsToHHMMSS = function () {
    let mins_num = parseFloat(this, 10);
    let hours = Math.floor(mins_num / 60);
    let minutes = Math.floor((mins_num - ((hours * 3600)) / 60));
    let seconds = Math.floor((mins_num * 60) - (hours * 3600) - (minutes * 60));

    // Appends 0 when unit is less than 10
    if (hours < 10) {
        hours = "0" + hours;
    }
    if (minutes < 10) {
        minutes = "0" + minutes;
    }
    if (seconds < 10) {
        seconds = "0" + seconds;
    }
    return hours + ':' + minutes + ':' + seconds;
};
