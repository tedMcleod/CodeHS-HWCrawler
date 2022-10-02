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
            let sectionList = document.getElementsByClassName('js-sections-menu dropdown-menu sections-dropdown')[0].children;
            let courses = {};
            let sections = {};
            let classesObj = {};
            for (let i = 1; i < sectionList.length; i++) {
                let listItem = sectionList[i];
                let sectionLink = listItem.getElementsByClassName('compact teacher-section-link')[0];
                let sectionName = sectionLink.getElementsByClassName('left')[0].innerHTML;
                let sectionPeriod = sectionName.substring(1, sectionName.indexOf(' '));
                let sectionHrefSplit = sectionLink.href.toString().split('/');
                let sectionId = sectionHrefSplit[sectionHrefSplit.length - 1];
                let hrefQuestion = sectionId.indexOf('?');
                if (hrefQuestion != -1) sectionId = sectionId.substring(0, hrefQuestion);

                let sectionInfo = document.getElementsByClassName('class-list-item wrap class_' + sectionId)[0];
                let courseId = sectionInfo.getAttribute('data-teacher-course-id').toString();
                let coursesDropdown = document.getElementsByClassName('js-courses-menu dropdown-menu sections-dropdown')[0];
                let courseName;
                for (let c = 1; c < coursesDropdown.children.length; c++) {
                    if (coursesDropdown.children[c].getAttribute('href').toString().indexOf(courseId) != -1) {
                        courseName = coursesDropdown.children[c].getElementsByClassName('left my-course-option-title')[0].innerHTML;
                        break;
                    }
                }


                if (!courses[courseName]) {
                    courses[courseName] = {'id': courseId, 'classes': {}};
                }
                courses[courseName]['classes'][sectionPeriod + ''] = sectionId;

            }

            return courses;
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
	                    type: 'text',
	                    name: 'assignment_name',
	                    message: 'Enter the name of the assignment',
	                    inital: 'untitled',
	                    validate: val => val.length > 0 ? true : 'Name cannot be blank!'
                	},
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
            sessionData['assignment_name'] = response['assignment_name'];

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
                    fs.access(path, fs.F_OK, (err) =>{
                        if (err){
                            reject1(false);
                        }
                        resolve1(true);
                    });
                });
            }

            let boolean_useCache = true;
            let boolean_buildCache = false;
            let {rebuildCache: forceCache} = sessionData;
            if (typeof forceCache !== "boolean") {
                errorExit('settings.js \'rebuildCache\' invalid, not a boolean');
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

            console.info('boolean use cache', boolean_useCache);
            console.info('boolean build cache', boolean_buildCache);
            if(!boolean_useCache && boolean_buildCache){
                spinner.text = chalk.bold(`[${obj.teacherName + '_P' + obj.classNum}] Preparing... (First run may take up to 5 minutes)`);
            }else{
                spinner.text = chalk.bold(`[${obj.teacherName + '_P' + obj.classNum}] Preparing... (Loading all assignments and IDs from cache)`);
            }
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
                }
                let bodyHTML = await page.evaluate(() => document.body.innerHTML);
                await writeFileAsync(path.join(cached_modulePath, 'index.html'), bodyHTML);
            }

            // duplicate assignments
            let arr_assignmentsCopy = arr_assignments.slice();

            page.on('console', consoleObj => {
                // Remove on prod, info is more or less for debug only
                if (consoleObj.text().includes('[ainfo]')) {
                    console.log(consoleObj.text().replace('[ainfo]', ''))
                }
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
            
            // arr_assignmentIDs, arr_obj_students should be populated now
            //console.info('[ainfo] arr_assignmentIDs', JSON.stringify(arr_assignmentIDs, null, 4));
            //console.info('[ainfo] arr_obj_students', JSON.stringify(arr_obj_students, null, 4));

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

            //console.info('[ainfo] obj_studentEmail: ' + JSON.stringify(obj_studentEmail, null, 4));

            if (boolean_useCache) rosterPage.close();

            for (let i = 0; i < arr_assignmentIDs.length; i++) {
                let temp_split = arr_assignmentIDs[i].url.substr(8).split('/');
                arr_assignmentIDs[i] = temp_split[6];
            }

            //console.info('[ainfo] arr_assignmentIDs: ' + JSON.stringify(arr_assignmentIDs, null, 4));


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

                    //console.info('[ainfo] fetching student pages' + JSON.stringify(arr_obj_students, null, 4));
                    // fetch date from students' page
                    await Promise.all(arr_obj_students.map(async (studentObject) => {
                        // console.info('processing', studentObject);
                        await limiter.schedule(() => {
                            const allTasks = arr_assignmentIDs.map(async (key) => {
                                return new Promise((res, rej) => {
                                    let xhr = new XMLHttpRequest();
                                    xhr.onload = async function () {
                                        let document = this.responseXML;
                                        //console.info('[ainfo] doc: ' + new XMLSerializer().serializeToString(document));
                                        //get problem name
                                        let problemName = document.title.split('|')[0].trim();

                                        const parent = document.querySelector('#teacher-revision-banner');
                                        const children = parent.querySelectorAll('span');
                                        const span = children[1];
                                        const dataId = span.getAttribute('data-id');
                                        const dataCodeUserId = span.getAttribute('data-code-user-id');
                                        const dataStudentAssignmentId = span.getAttribute('data-student-assignment-id');
                                        const dataItemId = span.getAttribute('data-item-id');
                                        //console.info("[ainfo] dataId = " + dataId + " dataCodeUserId = " + dataCodeUserId + " dataStudentAssignmentId = " + dataStudentAssignmentId + " dataItemId = " + dataItemId);

                                        let startedText;
                                        try {
                                            await getTabsAsync().then(tabs => {
                                            function htmlToElement(html) {
                                                    let doc = document.implementation.createHTMLDocument("Help Tab");
                                                    let div = document.createElement('div');
                                                    html = html.trim(); // Never return a text node of whitespace as the result
                                                    div.innerHTML = html;
                                                    doc.body.appendChild(div);
                                                    return doc;
                                                }
                                                //console.info("[ainfo] htmlTxt = " + htmlToElement(tabs['help tab'].text));
                                                let helpTabDoc = htmlToElement(tabs['help tab'].text);
                                                startedText = helpTabDoc.getElementById('started-time').innerText;
                                                //console.info('[ainfo] startedText = ' + startedText);
                                            });
                                        } catch (err) {
                                            studentObject.email = obj_studentEmail[studentObject.firstName + ' ' + studentObject.lastName];
                                            //console.info('[ainfo] email ' + studentObject.email);
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
                                                    editTime: '--',
                                                    code: null
                                                }],
                                                numberOfVersions: '--',
                                                numberOfSessions: '--'
                                            };

                                            await sleep(10000); // wait ten seconds before messing up

                                            res(1);
                                        }
                                        
                                        //console.info('[ainfo] startedText after request = ' + startedText);

                                        startedText = startedText.trim();
                                        let onIndex = startedText.indexOf('on');
                                        let dateText = startedText.substring(onIndex + 2).trim();
                                        startedText = dateText.replace('p.m.', 'PM').replace('a.m.', 'AM');
                                        if (startedText.indexOf(':') === -1) {
                                            let spc = startedText.lastIndexOf(' ');
                                            startedText = startedText.substring(0, spc) + ":00" + startedText.substring(spc);
                                        }
                                        //console.info('[ainfo] formatted startedText = ' + startedText);
                                        let date_startDate = new Date(startedText);
                                        //console.info('[ainfo] start time text', startedText);
                                        //console.info('[ainfo] date_startDate.toString()', date_startDate.toString());
                                        //console.log('raw start text', startedText);
                                        //console.info('start date object', date_startDate);
                                        let year = date_startDate.getFullYear();
                                        let month = (1 + date_startDate.getMonth()).toString().padStart(2, '0');
                                        let day = date_startDate.getDate().toString().padStart(2, '0');
                                        let firstTryDate = month + '/' + day + '/' + year;
                                        let firstTryTime = date_startDate.toLocaleTimeString(navigator.language, {
                                            hour: '2-digit',
                                            minute: '2-digit'
                                        });

                                        //console.info('[ainfo] start date object (local)', date_startDate.toString());
                                        //get problem status

                                        //https://codehs.com/lms/ajax/get_student_assignment_status?studentAssignmentId=1481117717&method=get_student_assignment_status
                                        let problemStatus;
                                        await getStatusAsync().then(statusData => {
                                            problemStatus = statusData.css_class
                                        });

                                        //console.info('[ainfo] problemStatus = ' + problemStatus);

                                        // get submissions
                                        let selectionField = document.getElementById('assignment-submission-select');

                                        let submittedOnTime = false;
                                        //console.info('[ainfo] date_dueDate', date_dueDate);
                                        let dueDateObj = new Date(date_dueDate);
                                        if (selectionField) {
                                            let submissions = selectionField.getElementsByTagName('option');
                                            //console.info('[ainfo] submissions.length', submissions.length);
                                            for (let i = 0; i < submissions.length; i++) {
                                                let subDateTxt = submissions[i].innerText.replace('p.m.', 'PM').replace('a.m.', 'AM');
                                                if (subDateTxt.indexOf(':') === -1) {
                                                    let spc = subDateTxt.lastIndexOf(' ');
                                                    subDateTxt = subDateTxt.substring(0, spc) + ":00" + subDateTxt.substring(spc);
                                                }
                                                let date_submissionDate = new Date(subDateTxt);
                                                let subYr = date_startDate.getFullYear();
                                                if (date_submissionDate.getMonth() < date_startDate.getMonth()) {
                                                    subYr++;
                                                }
                                                date_submissionDate.setFullYear(subYr);
                                                let timeDiff = dueDateObj.getTime() - date_submissionDate.getTime();
                                                //console.info('[ainfo] due date: ' + dueDateObj.toISOString() + " submission date: " + date_submissionDate.toISOString() + " has time diff: " + timeDiff);
                                                if (timeDiff >= 0) {
                                                    submittedOnTime = true;
                                                }
                                            }
                                        }

                                        //Time spent on assignment
                                        let runningTotalSeconds = 0;
                                        let onTimeSeconds = 0;

                                        let numVersions = 0;
                                        let numSesh = 1;

                                        //holds all of a student's code
                                        let arr_obj_studentCodes = [];
                                        
                                        await getCodeHistoryAsync().then(historyData => {
                                            function unescape(htmlStr) {
                                               return htmlStr.replaceAll('&quot;','"').replaceAll('&apos;','').replaceAll('&amp;','&').replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&nbsp;','\n').replaceAll('&iexcl;','¡').replaceAll('&cent;','¢').replaceAll('&pound;','£').replaceAll('&curren;','¤').replaceAll('&yen;','¥').replaceAll('&brvbar;','¦').replaceAll('&sect;','§').replaceAll('&uml;','¨').replaceAll('&copy;','©').replaceAll('&ordf;','ª').replaceAll('&laquo;','«').replaceAll('&not;','¬').replaceAll('&shy;','\u00AD').replaceAll('&reg;','®').replaceAll('&macr;','¯').replaceAll('&deg;','°').replaceAll('&plusmn;','±').replaceAll('&sup2;','²').replaceAll('&sup3;','³').replaceAll('&acute;','´').replaceAll('&micro;','µ').replaceAll('&para;','¶').replaceAll('&middot;','·').replaceAll('&cedil;','¸').replaceAll('&sup1;','¹').replaceAll('&ordm;','º').replaceAll('&raquo;','»').replaceAll('&frac14;','¼').replaceAll('&frac12;','½').replaceAll('&frac34;','¾').replaceAll('&iquest;','¿').replaceAll('&times;','×').replaceAll('&divide;','÷').replaceAll('&Agrave;','À').replaceAll('&Aacute;','Á').replaceAll('&Acirc;','Â').replaceAll('&Atilde;','Ã').replaceAll('&Auml;','Ä').replaceAll('&Aring;','Å').replaceAll('&AElig;','Æ').replaceAll('&Ccedil;','Ç').replaceAll('&Egrave;','È').replaceAll('&Eacute;','É').replaceAll('&Ecirc;','Ê').replaceAll('&Euml;','Ë').replaceAll('&Igrave;','Ì').replaceAll('&Iacute;','Í').replaceAll('&Icirc;','Î').replaceAll('&Iuml;','Ï').replaceAll('&ETH;','Ð').replaceAll('&Ntilde;','Ñ').replaceAll('&Ograve;','Ò').replaceAll('&Oacute;','Ó').replaceAll('&Ocirc;','Ô').replaceAll('&Otilde;','Õ').replaceAll('&Ouml;','Ö').replaceAll('&Oslash;','Ø').replaceAll('&Ugrave;','Ù').replaceAll('&Uacute;','Ú').replaceAll('&Ucirc;','Û').replaceAll('&Uuml;','Ü').replaceAll('&Yacute;','Ý').replaceAll('&THORN;','Þ').replaceAll('&szlig;','ß').replaceAll('&agrave;','à').replaceAll('&aacute;','á').replaceAll('&acirc;','â').replaceAll('&atilde;','ã').replaceAll('&auml;','ä').replaceAll('&aring;','å').replaceAll('&aelig;','æ').replaceAll('&ccedil;','ç').replaceAll('&egrave;','è').replaceAll('&eacute;','é').replaceAll('&ecirc;','ê').replaceAll('&euml;','ë').replaceAll('&igrave;','ì').replaceAll('&iacute;','í').replaceAll('&icirc;','î').replaceAll('&iuml;','ï').replaceAll('&eth;','ð').replaceAll('&ntilde;','ñ').replaceAll('&ograve;','ò').replaceAll('&oacute;','ó').replaceAll('&ocirc;','ô').replaceAll('&otilde;','õ').replaceAll('&ouml;','ö').replaceAll('&oslash;','ø').replaceAll('&ugrave;','ù').replaceAll('&uacute;','ú').replaceAll('&ucirc;','û').replaceAll('&uuml;','ü').replaceAll('&yacute;','ý').replaceAll('&thorn;','þ').replaceAll('&yuml;','ÿ');   
                                            }

                                            let starterCode = unescape(historyData[0].files[0].text);
                                            let versions = [];
                                            for (let i = 1; i < historyData.length; i++) {
                                                let versionData = historyData[i];
                                                let versionDate = new Date(versionData.timestamp);
                                                let versionCode = unescape(versionData.files[0].text);

                                                // data for calculating time worked
                                                versions.push({
                                                    date: versionDate,
                                                    code: versionCode
                                                });

                                                // data for file writing
                                                arr_obj_studentCodes.push({
                                                    editTime: versionDate.toISOString(),
                                                    code: versionCode
                                                });
                                            }

                                            // get work time and sessions
                                            numVersions = versions.length;
                                            let prevDate = versions[0].date;
                                            let dt = 0;
                                            for (let i = 0; i < versions.length; i++) {
                                                let v = versions[i];
                                                let deltaTime = (v.date.getTime() - prevDate.getTime()) / 1000; //in seconds
                                                //console.info('[ainfo] time diff: ' + deltaTime);
                                                if (deltaTime > 30 * 60) { // time elapsed > 30 mins?
                                                    numSesh++;
                                                } else {
                                                    runningTotalSeconds += deltaTime;
                                                    if (v.date.getTime() <= dueDateObj.getTime()) {
                                                        onTimeSeconds += deltaTime;
                                                    }
                                                }
                                                prevDate = v.date; //update prev to rn
                                            }

                                            if (!String.prototype.splice) {
                                                String.prototype.splice = function (idx, rem, str) {
                                                    return this.slice(0, idx) + str + this.slice(idx + Math.abs(rem));
                                                };
                                            }
                                        }).catch(err => {
                                            console.error(err);
                                            //ignore
                                        });

                                        let late = submittedOnTime;

                                        //https://codehs.com/editor/ajax/ajax_abacus_history?code_user_id=3591904&item_id=74&student_assignment_id=1481117718&viewer_id=104748&method=ajax_abacus_history
                                        function getCodeHistoryAsync() {
                                            return new Promise(function (resolve2, reject2) {
                                                let xmlhr = new XMLHttpRequest();
                                                xmlhr.onreadystatechange = function () {
                                                    if (this.readyState === 4) {
                                                        if (this.status === 200) {
                                                            resolve2(JSON.parse(this.responseText).history);
                                                        } else {
                                                            reject2(this.status);
                                                        }
                                                    }
                                                };
                                                xmlhr.open("POST", "https://codehs.com/editor/ajax/ajax_abacus_history?code_user_id=" + dataCodeUserId + "&item_id=" + dataItemId + "&student_assignment_id=" + dataStudentAssignmentId + "&viewer_id=" + dataId + "&method=ajax_abacus_history", true);
                                                xmlhr.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
                                                xmlhr.setRequestHeader('x-requested-with', 'XMLHttpRequest');
                                                xmlhr.setRequestHeader('x-csrftoken', getCookie('csrftoken'));
                                                xmlhr.send();
                                            });
                                        }

                                        function getStatusAsync() {
                                            return new Promise(function (resolve2, reject2) {
                                                let xmlStatus = new XMLHttpRequest();
                                                xmlStatus.onreadystatechange = function () {
                                                    if (this.readyState === 4) {
                                                        if (this.status === 200) {
                                                            resolve2(JSON.parse(this.responseText));
                                                        } else {
                                                            reject2(this.status);
                                                        }
                                                    }
                                                };
                                                // possible css status:
                                                /*
                                                    'finalized'
                                                    'not-submitted'
                                                    'reviewed'
                                                    'submitted-after-review'
                                                    'unopened'
                                                    'submitted'
                                                */
                                                //https://codehs.com/lms/ajax/get_student_assignment_status?studentAssignmentId=1481117717&method=get_student_assignment_status
                                                xmlStatus.open("POST", "https://codehs.com/lms/ajax/get_student_assignment_status?studentAssignmentId=" + dataStudentAssignmentId + "&method=get_student_assignment_status", true);
                                                xmlStatus.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
                                                xmlStatus.setRequestHeader('x-requested-with', 'XMLHttpRequest');
                                                xmlStatus.setRequestHeader('x-csrftoken', getCookie('csrftoken'));
                                                xmlStatus.send();
                                            });
                                        }

                                        //https://codehs.com/editor/ajax/batch_abacus_editor_tabs?requestData%5Bitem_id%5D=74&requestData%5Bmodule_id%5D=0&requestData%5Bcourse_id%5D=0&requestData%5Bcode_user_id%5D=3591904&requestData%5Bstudent_assignment_id%5D=1481117718&requestData%5Bresult_world%5D=&tabNames%5B%5D=overview+left+tab&tabNames%5B%5D=exercise+tab&tabNames%5B%5D=autograder+tab&tabNames%5B%5D=lms+grading+tab&tabNames%5B%5D=solution+tab&tabNames%5B%5D=video+tab&tabNames%5B%5D=help+tab&tabNames%5B%5D=download+tab&tabNames%5B%5D=about+tab&tabNames%5B%5D=teacher+tab&tabNames%5B%5D=share+tab&tabNames%5B%5D=upload+tab&method=batch_abacus_editor_tabs
                                        function getTabsAsync() {
                                            return new Promise(function (resolve2, reject2) {
                                                let xmlTabs = new XMLHttpRequest();
                                                xmlTabs.onreadystatechange = function () {
                                                    if (this.readyState === 4) {
                                                        if (this.status === 200) {
                                                            console.log("restxt = ", JSON.parse(this.responseText).tabs);
                                                            resolve2(JSON.parse(this.responseText).tabs);
                                                        } else {
                                                            reject2(this.status);
                                                        }
                                                    }
                                                };
                                                xmlTabs.open("POST", "https://codehs.com/editor/ajax/batch_abacus_editor_tabs?requestData%5Bitem_id%5D=" + dataItemId + "&requestData%5Bmodule_id%5D=0&requestData%5Bcourse_id%5D=0&requestData%5Bcode_user_id%5D=" + dataCodeUserId + "&requestData%5Bstudent_assignment_id%5D=" + dataStudentAssignmentId + "&requestData%5Bresult_world%5D=&tabNames%5B%5D=overview+left+tab&tabNames%5B%5D=exercise+tab&tabNames%5B%5D=autograder+tab&tabNames%5B%5D=lms+grading+tab&tabNames%5B%5D=solution+tab&tabNames%5B%5D=video+tab&tabNames%5B%5D=help+tab&tabNames%5B%5D=download+tab&tabNames%5B%5D=about+tab&tabNames%5B%5D=teacher+tab&tabNames%5B%5D=share+tab&tabNames%5B%5D=upload+tab&method=batch_abacus_editor_tabs", true);
                                                xmlTabs.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
                                                xmlTabs.setRequestHeader('x-requested-with', 'XMLHttpRequest');
                                                xmlTabs.setRequestHeader('x-csrftoken', getCookie('csrftoken'));
                                                xmlTabs.send();
                                            });
                                        }

                                        studentObject.email = obj_studentEmail[studentObject.firstName + ' ' + studentObject.lastName];
                                        //console.info('[ainfo] student email', studentObject.email);
                                        studentObject.assignments['' + key] = {
                                            problemName: problemName,
                                            firstTryDate: firstTryDate,
                                            firstTryTime: firstTryTime,
                                            timeWorkedBeforeDue: onTimeSeconds / 60,
                                            timeWorkedTotal: runningTotalSeconds / 60,
                                            onTimeStatus: "not determined",
                                            // isSubmitted: submitted, favoring the not-not-submitted or not-unopened method
                                            isLate: late,
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
                        //calculate on time status for each exercise
                        console.info(studentObject);
                        let {assignments} = studentObject;

                        let totalTimeWorked = 0;
                        let totalPoints = 0;
                        let arr_assignmentsKeys = Object.keys(assignments);
                        arr_assignmentsKeys.forEach(key => {
                            totalTimeWorked += assignments[key].timeWorkedTotal ? assignments[key].timeWorkedTotal : 0;
                        });

                        /*
                        Possible problem status values:
                            'finalized'
                            'not-submitted'
                            'reviewed'
                            'submitted-after-review'
                            'unopened'
                            'submitted'
                        */

                        let numExercises = arr_assignmentsKeys.length;
                        arr_assignmentsKeys.forEach(key => {
                            let {timeWorkedTotal, timeWorkedBeforeDue} = assignments[key];
                            let {problemStatus} = assignments[key];
                            let isSubmitted = !problemStatus.includes('not-submitted') && !problemStatus.includes('unopened');
                            if (timeWorkedTotal >= 45 / numExercises || isSubmitted) {
                                assignments[key].pointsAwarded = 1;
                            } else if (timeWorkedTotal >= 45 / (numExercises * 3)) {
                                assignments[key].pointsAwarded = Math.round(timeWorkedTotal / (45 / numExercises) * 100) / 100;
                            } else {
                                assignments[key].pointsAwarded = 0;
                            }
                            totalPoints += assignments[key].pointsAwarded;

                            // on-time-status calcs start here
                            if(!isSubmitted && timeWorkedTotal < 45 / (numExercises * 3)){
                                assignments[key].onTimeStatus = 'missing';
                            }else if(!assignments[key].isLate || timeWorkedBeforeDue >= 45 / (numExercises * 3)){
                                assignments[key].onTimeStatus = 'on time';
                            }else{
                                assignments[key].onTimeStatus = 'late';
                            }
                        });

                        if (totalTimeWorked >= 45) {
                            //award full points to the full assignment
                            totalPoints = numExercises;
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
            let {date_dueDate, outDirectory, assignment_name} = sessionData;
            let content_rows = [];
            let headers = ['Name', 'Period', 'E-mail'];

            let outPath = path.join(outDirectory, 'grades', `${classObj.teacherName}_P${classObj.classNum}`);

            //sessionData.arr_assignments is unreliable because actual assignment list may be changed
            // console.info(classObj.students[0].assignments);
            //let assignmentsStr = '';
            Object.keys(classObj.students[0].assignments).forEach(assignmentKey => {
                //let assignmentName = classObj.students[0].assignments[assignmentKey].problemName;
                // console.info('assignmentName' , assignmentName);
                headers.push('Problem', 'Due', 'First Try', 'First Time', 'Time Worked By Due Date', 'Total Time Worked', 'On Time Status', 'Problem Status', 'Points', 'Number of Versions', 'Number of Sessions');
                //assignmentsStr += safePathComponent(assignmentName.toString().replaceAll(' ', '-') + '_');
            });
            outPath = path.join(outPath, assignment_name).trim() + '_' + dateStrRN.replaceAll('/', '-') + '.csv';
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

                let allMissing = true;
                let isOnTime = false;

                Object.keys(studentObj.assignments).forEach(assignmentIDs => {
                    studentRow.push(studentObj.assignments[assignmentIDs].problemName);
                    let d = new Date(date_dueDate);
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
                    if (studentObj.assignments[assignmentIDs].onTimeStatus.includes('on time')) {
                        allMissing = false;
                        isOnTime = true;
                    }

                    if(studentObj.assignments[assignmentIDs].onTimeStatus.includes('late')) {
                        allMissing = false;
                    }

                    studentRow.push(studentObj.assignments[assignmentIDs].problemStatus);
                    studentRow.push(studentObj.assignments[assignmentIDs].pointsAwarded);
                    studentRow.push(studentObj.assignments[assignmentIDs].numberOfVersions);
                    studentRow.push(studentObj.assignments[assignmentIDs].numberOfSessions);
                });

                studentRow.push(studentObj.totalPoints);
                studentRow.push(10);
                studentRow.push(allMissing ? 'missing' : (isOnTime ? 'on time' : 'late'));
                studentRow.push(studentObj.timeSpentTotal.toString().minsToHHMMSS());
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
                                    writeQueue.push(writeFileAsync(path.join(folderPath, studentIdentifier + '.js'), removeFormattingCharacters(codes[codes.length - 1].code)));
                                } else {
                                    writeQueue.push(writeFileAsync(path.join(folderPath, studentIdentifier + '.js'), codes[codes.length - 1].code));
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
