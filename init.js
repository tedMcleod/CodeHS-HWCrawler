const prompts = require('prompts');
const validator = require('validator');
const ora = require('ora');
const chalk = require('chalk');

const os = require('os');

const puppeteer = require('puppeteer');
let sessionData = {};

(async () => {
    const onCancel = prompt => {
        console.log(`${chalk.red('Canceling session')}`);
        process.exit();
    };
    sessionData = await prompts([
            {
                type: 'text',
                name: 'text_codehs-email',
                message: 'What is your CodeHS email?',
                validate: value => validator.isEmail(value) ? true : 'Enter a valid email'
            },
            {
                type: 'password',
                name: 'text_codehs-password',
                message: 'What is your CodeHS password?'
            }
        ], {onCancel}
    );

    const spinner = ora({text: `${chalk.white.bold('Testing credentials...')}`}).start();

    const browser = await puppeteer.launch({
        // headless: false //TODO: remove for production
    });

    const page = await browser.newPage();

    await loginCodeHS(page).then(suc => {
        spinner.succeed(`${chalk.white.bold('Password success')}`);
    }).catch(err => {
        spinner.fail(`${chalk.red('Login credentials invalid...')}`);
        process.exit();
    });

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
                    title: 'None', description: 'Super Simple', value: 'none',
                }
            ],
            hint: '- up/down to navigate. return to submit',
            initial: 0
        }
    ]);

    let {save} = saveData;
    if (save) {
        let {method} = saveData;
        if(method === 'none'){
            await writeFileAsync('secrets/creds.json', JSON.stringify({
                method: 'none',
                email: sessionData['text_codehs-email'],
                password: sessionData['text_codehs-password']
            }))
        }else if(method === 'pin'){

        }else if(method === 'pwd'){

        }else{
            console.err('invalid method detected. ');
            process.exit(0);
        }
    }

    browser.close();
})();

function loginCodeHS(pg) {
    return new Promise(async (resolve, reject) => {
        await pg.goto('https://codehs.com/login', {waitUntil: 'networkidle2'});

        const EMAIL_SELECTOR = '#login-email';
        const PASSWORD_SELECTOR = '#login-password';
        const BUTTON_SELECTOR = '#login-submit';

        await pg.click(EMAIL_SELECTOR);
        await pg.keyboard.type(sessionData['text_codehs-email']);

        await pg.click(PASSWORD_SELECTOR);
        await pg.keyboard.type(sessionData['text_codehs-password']);

        await pg.click(BUTTON_SELECTOR);

        await pg.waitForNavigation();

        let warningsLength = await pg.evaluate(() => {
            return document.getElementsByClassName('form-alert-red').length;
        });

        await pg.close();

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

async function writeFileAsync (path, content){
    return new Promise((resolve, reject) =>{
        fs.writeFile(path, content, function (err) {
            if (err) {
                reject(err);
            }else{
                resolve('ok');
            }
        })
    });
}