const prompts = require('prompts');
const validator = require('validator');
const ora = require('ora');
const chalk = require('chalk');

const os = require('os');

const puppeteer = require('puppeteer');
let sessionData = {};

(async () => {
    sessionData = await prompts([{
            type: 'text',
            name: 'text_codehs-email',
            message: 'What is your CodeHS email?',
            validate: value => validator.isEmail(value) ? true : 'Enter a valid email'
        },
            {
                type: 'password',
                name: 'text_codehs-password',
                message: 'What is your CodeHS password?'
            },
            {
                type: 'confirm',
                name: 'boolean_save-password',
                message: 'Save password?'
            }
        ]
    );

    const spinner = ora({text: `${chalk.white.bold('Building initial CodeHS cache')}`}).start();

    const browser = await puppeteer.launch({
        headless: false //TODO: remove for production
    });

    const page = await browser.newPage();

    await loginCodeHS(page).then(suc =>{
        spinner.succeed(`${chalk.white.bold('Cache built')}`);
    }).catch(err=> {
        spinner.fail(`${chalk.red('Login credentials invalid...')}`);
        spinner.fail(`${chalk.red.bold('Cache canceled')}`);
    });


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

        // await pg.close();

        if(warningsLength.length === 0){
            resolve(1);
        }else{
            reject(warningsLength);
        }
    });
}