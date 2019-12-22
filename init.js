const prompts = require('prompts'),
    validator = require('validator'),
    ora = require('ora'),
    chalk = require('chalk'),
    fs = require('fs'),
    os = require('os'),
    path = require('path'),
    puppeteer = require('puppeteer');

let crypto;
try {
    crypto = require('crypto');
} catch (err) {
    console.log('crypto support is required but is disabled!');
    process.exit(0);
}

let sessionData = {};

// """main function"""
(async () => {
    if (savedCredsExist()) {
        await loadCredentialsPrompts();
        await testCredentials().catch(() => codeHSCredInvalidExit);
    } else {
        await setCredentialsPrompts();
        await testCredentials().catch(() => codeHSCredInvalidExit);
        await promptSavePwdOptions();
    }


    /*
          _    _ ______ _      _____  ______ _____   _____
         | |  | |  ____| |    |  __ \|  ____|  __ \ / ____|
         | |__| | |__  | |    | |__) | |__  | |__) | (___
         |  __  |  __| | |    |  ___/|  __| |  _  / \___ \
         | |  | | |____| |____| |    | |____| | \ \ ____) |
         |_|  |_|______|______|_|    |______|_|  \_\_____/

     */

    function codeHSCredInvalidExit() {
        console.info('Perhaps you changed your credentials on codehs.com?');
        process.exit();
    }

    async function testCredentials() {
        return new Promise(async (resolve, reject) => {
            const spinner = ora({text: `${chalk.white.bold('Testing credentials...')}`}).start();

            const browser = await puppeteer.launch({
                // headless: false //TODO: remove for production
            });

            const page = await browser.newPage();

            await loginCodeHS(page).then(suc => {
                spinner.succeed(`${chalk.white.bold('Password success')}`);
            }).catch(err => {
                spinner.fail(`${chalk.red('Login credentials invalid...')}`);
                reject(0);
            });

            await browser.close();

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

    function onCancel(prompt){
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

    async function promptSavePwdOptions(){
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
        // resolve('assume credentials are correct'); //TODO: remove on prod
        let warningsLength;
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

            warningsLength = await pg.evaluate(() => {
                return document.getElementsByClassName('form-alert-red').length;
            });

            await pg.close();
        } catch {
            reject(-1);
        }
        if (warningsLength === 0) {
            resolve(1);
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
        fs.writeFile(path, content, function (err) {
            if (err) {
                reject(err);
            } else {
                resolve('ok');
            }
        })
    });
}

function savedCredsExist() {
    return fs.existsSync(path.join(__dirname, '/secrets/creds.json')) ? require('./secrets/creds.json').method != null && require('./secrets/creds.json').email : false;
}