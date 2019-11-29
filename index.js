const pLimit = require('p-limit');
const limit = pLimit(2); //TODO: Change this to be based on cpu cores
const puppeteer = require('puppeteer');
const CREDS = require('./secrets/creds');
const SECTIONS = require('./secrets/sections');
const TEMPLATE_HOME_URL = 'https://codehs.com/lms/assignments/{0}/section/{1}/time_tracking';
const format = require('string-format');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;

console.log('loaded index.js');
let arr_args = process.argv.slice(2);

if (arr_args.length === 0) {
    arr_args = ['11/22/19', '11:11', '2', 'Mindsets', 'Short Stack', '2', 'm0', 's0'];
}

// console.log('arguments', arr_args);

let arr_dueDate = arr_args[0].split('/');
let arr_dueTime = arr_args[1].split(':');

let date_dueDate = new Date((arr_dueDate[2].length !== 4 ? 2000 + (+arr_dueDate[2]) : +arr_dueDate[2]),
    +arr_dueDate[0], +arr_dueDate[1], +arr_dueTime[0], +arr_dueTime[0], 0, 0);

let assignmentsCount = +arr_args[2];
let arr_assignments = [];
for (let i = 0; i < assignmentsCount; i++) {
    arr_assignments.push(arr_args[3 + i].toString().toLowerCase());
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
                    classId: SECTIONS[teacherInitial].classes[classNum]
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
                classId: SECTIONS[teacherInitial].classes[classNum]
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

    //Grab all assignment IDs
    // await page.goto(format('https://codehs.com/lms/assignments/{0}/section/{1}/progress', arr_objs_classes[0].sectionId, arr_objs_classes[0].classId), {waitUntil: 'networkidle2', timeout: 0});
    // await page.waitForSelector('#activity-progress-table', {visible: true, timeout: 0});
    //
    // let arr_assignmentsCopy = arr_assignments.slice();
    // let arr_assignmentIDs = await page.evaluate((arr_assignmentsCopy)=>{
    //     console.info(arr_assignmentsCopy);
    //     let arr_IDs = [];
    //     let children_possibleNodes = document.getElementsByClassName('activity-item');
    //     for (let i = 0; i < children_possibleNodes.length; i++) {
    //         if(children_possibleNodes[i].getAttribute('data-original-title')){
    //             let str = children_possibleNodes[i].getAttribute('data-original-title').toLowerCase();
    //             for (let j = 0; j < arr_assignmentsCopy.length; j++) {
    //                 if(str.includes(arr_assignmentsCopy[j])){
    //                     //got one assignment
    //                     arr_IDs.push({name: arr_assignmentsCopy[j], url: children_possibleNodes[i].children[0].href});
    //                     arr_assignmentsCopy.splice(j, 1);
    //                     break;
    //                 }
    //             }
    //             if(arr_assignmentsCopy.length === 0){
    //                 //got all assignments needed
    //                 break;
    //             }
    //         }
    //     }
    //     return arr_IDs;
    // }, arr_assignmentsCopy);
    // for (let i = 0; i < arr_assignmentIDs.length; i++) {
    //     let temp_split = arr_assignmentIDs[i].url.substr(8).split('/');
    //     arr_assignmentIDs[i] = temp_split[6];
    // }

    let arr_assignmentIDs = ['1131116', '1131124'];
    console.info(arr_assignmentIDs);

    if(arr_assignmentIDs.length < arr_assignments.length){
        console.error('Some assignments were not found !');
    }

    let temp = arr_objs_classes.slice(5); //TODO: Delete this in prod
    let input = [];
    temp.forEach(obj => {
        input.push(parseEachStudent(obj, browser))
    });

    const result = await Promise.all(input);
    console.log(result);

    // await browser.close();
}


async function parseEachStudent(obj, browser) {
    return new Promise(async (resolve, reject) => {
        const page = await browser.newPage();
        await page.goto(obj.url, {waitUntil: 'networkidle2', timeout: 0});
        await page.waitForSelector('#activity-progress-table', {visible: true, timeout: 0});
        await page.evaluate(
            (arr_assignments)=>{
                let table = document.getElementById('activity-progress-table').children[0].getElementsByClassName('student-row');

                //TODO: Need to go through each status indicator, check link, add time spent to final obj arr

                //TODO: Also need to go through and fetch submission times

                return (table.length);
            }, arr_assignments
        ).then(res => {
            console.info(res);
        });


        resolve('done ' + obj.teacherName + ' p' + obj.classNum);
    })
}