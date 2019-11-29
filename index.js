console.log('loaded index.js');
let arr_args = process.argv.slice(2);

if(arr_args.length === 0){
    arr_args = ['11/11/2019', '12:12', 'A,', 'AB,', 'ABC,', 'ABCD,', 'ABCDE']
}

// console.log('arguments', arr_args);

let arr_dueDate = arr_args[0].split('/');
let arr_dueTime = arr_args[1].split(':');

let date_dueDate = new Date(+arr_dueDate[2], +arr_dueDate[0], +arr_dueDate[1], +arr_dueTime[0], +arr_dueTime[0], 0, 0);

let assignmentsCount = arr_args[2];
let arr_assignments = [];
for(let i = 0; i < +assignmentsCount; i ++){
    arr_assignments.push(arr_args[3 + i]);
}

console.info(date_dueDate);
console.info(arr_assignments);


const puppeteer = require('puppeteer');
const CREDS = require('./creds');

(async () => {
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




    // await page.screenshot({path: 'example.png'});
    await browser.close();
})();