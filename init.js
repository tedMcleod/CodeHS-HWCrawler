const prompts = require('prompts'),
    validator = require('validator'),
    ora = require('ora'),
    chalk = require('chalk'),
    fs = require('fs'),
    os = require('os'),
    path = require('path'),
    mkdirp = require('mkdirp'),
    puppeteer = require('puppeteer'),
    format = require('string-format'),
    links = require('./templates/links');

let crypto, browser;
try {
    crypto = require('crypto');
} catch (err) {
    console.log('crypto support is required but is disabled!');
    process.exit(0);
}

let sessionData = {rebuildCache: false},
    arr_objs_classes = [];

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
        await testCredentials().catch((quit) => codeHSCredInvalidExit);
    } else {
        await setCredentialsPrompts();
        await testCredentials().catch((quit) => codeHSCredInvalidExit);
        await promptSavePwdOptions();
        await continueConfirmation().catch((quit) => doneSetupExit);
    }

    if (savedSectionsIDExist()) {
        await loadSavedSectionIDs();
    }else{
        await parseSectionIDs();
    }

    await promptAssignmentOptions();

    await assembleClassQueues();





    await stopPuppeteer();

    /*
          _    _ ______ _      _____  ______ _____   _____
         | |  | |  ____| |    |  __ \|  ____|  __ \ / ____|
         | |__| | |__  | |    | |__) | |__  | |__) | (___
         |  __  |  __| | |    |  ___/|  __| |  _  / \___ \
         | |  | | |____| |____| |    | |____| | \ \ ____) |
         |_|  |_|______|______|_|    |______|_|  \_\_____/

     */

    async function assembleClassQueues(){
        return new Promise((resolve, reject)=> {
            const spinner = ora({text: `${chalk.bold('Assembling parsing queue')}`}).start();

            let {arr_classes} = sessionData;
            let {sections} = sessionData;

            let arr_completed = [];
            arr_classes.forEach(obj => {
                let teacherName = obj.split('|')[0];
                let classIdentifier = obj.split('|')[1];
                if(classIdentifier === '0'){
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
                }else{
                    if(!arr_completed.includes(teacherName)){
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

    async function loadSavedSectionIDs(){
        sessionData.sections = require('./secrets/sections.json');
    }

    async function parseSectionIDs() {
        const spinner = ora({text: `${chalk.bold('Parsing section IDs...')}`}).start();

        const pg = await browser.newPage();
        let teacherID;
        if (require('./secrets/teacher.json') && require('./secrets/teacher.json').teacherID) {
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
        let sections = await pg.evaluate(()=> {
            let tmp_arr_secs = document.getElementsByClassName('teachercourse-header');

            let sections = {};

            for (let i = 0; i < tmp_arr_secs.length; i++) {
                let container = tmp_arr_secs[i].getElementsByClassName('course-title')[0];

                let name = container.innerHTML.toString().trim().substring(0, container.innerHTML.toString().trim().indexOf(' '));
                // console.info(name);
                let tmp_id_split = container.href.toString().split('/');
                let teacherURL = tmp_id_split[tmp_id_split.length-1];
                let selectors = document.querySelectorAll('[data-teacher-course-id="'+ teacherURL +'"]');
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
        await writeFileAsync('./secrets/sections.json', JSON.stringify(sections));

        sessionData.sections = sections;

        await pg.close();

        spinner.succeed(`${chalk.bold('Section IDs saved in ./secrets/sections.json')}`);
    }


    async function promptAssignmentOptions() {
        return new Promise(async (resolve, reject) => {
            const response = await prompts([
                    {
                        type: 'list',
                        name: 'arr_assignments',
                        message: `Enter assignment names (separated by ${chalk.bold(',')})`,
                        initial: '',
                        separator: ',',
                        validate: val => val.toString().length > 0 ? true: 'Enter at least one assignment!'
                    },
                    {
                        type: 'date',
                        name: 'date_dueDate',
                        message: 'When are these assignments due?',
                        initial: new Date(2019, 1, 11),
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

            function buildOptions () {
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

    function doneSetupExit() {
        console.info(`That\'s alright, ${chalk.bold('npm start index.js')} to run again!`);
        process.exit();
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


    async function startPuppeteer() {
        browser = await puppeteer.launch({
            // headless: false //TODO: remove for production
        });
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

    function codeHSCredInvalidExit() {
        console.info('Perhaps you changed your credentials on codehs.com?');
        process.exit();
    }

    async function testCredentials() {
        return new Promise(async (resolve, reject) => {
            const spinner = ora({text: `${chalk.bold('Testing credentials...')}`}).start();

            const page = await browser.newPage();

            await loginCodeHS(page).then(async suc => {
                if(!fs.existsSync(path.join(__dirname, '/secrets/teacher.json'))){
                    await writeFileAsync('secrets/teacher.json', JSON.stringify({teacherID: suc}));
                }
                spinner.succeed(`${chalk.bold('Login credentials valid')}`);
            }).catch(err => {
                spinner.fail(`${chalk.red('Login credentials invalid...')}`);
                reject(0);
            });

            resolve(1);
        })
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
            } catch {
                console.log(`${chalk.red(`Your ${method === 'pwd' ? 'password' : 'pin'} was incorrect... exiting...`)}`);
                process.exit();
            }

            sessionData.password = decrypted.toString();
        } else {
            console.info('Unknown save method, quitting...');
            process.exit();
        }
    }

    function onCancel(prompt) {
        console.log(`${chalk.red('Canceling session')}`);
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
                    validate: value => validator.isAlphanumeric(value + '')
                }
            ], {onCancel}
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
        ], {onCancel});

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
                }, {onCancel});
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
                }, {onCancel});
                let cryptoKey = crypto.createCipheriv('aes-128-cbc', key, resizedIV);
                password = cryptoKey.update(password, 'utf8', 'hex');
                password += cryptoKey.final('hex');
            } else {
                // cancel
                process.exit();
            }

            //finally, write finalized email/password to file

            await writeFileAsync('secrets/creds.json', JSON.stringify({
                method: method,
                email: email,
                password: password
            }))
        }
    }
})();

function loginCodeHS(pg) {
    return new Promise(async (resolve, reject) => {
        resolve('assume credentials are correct'); //TODO: remove on prod
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
        } catch {
            reject(-1);
        }
        if (warningsLength === 0) {
            resolve(teacherID);
        } else {
            reject(warningsLength);
        }
    });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function writeFileAsync(path, content) {
    return new Promise((resolve, reject) => {
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

function savedCredsExist() {
    try {
        return fs.existsSync(path.join(__dirname, '/secrets/creds.json')) ? require('./secrets/creds.json').method != null && require('./secrets/creds.json').email : false;
    } catch {
        return false;
    }
}

function savedSectionsIDExist() {
    try {
        return fs.existsSync(path.join(__dirname, '/secrets/sections.json'));
    } catch {
        return false;
    }
}