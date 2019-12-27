# CodeHS Crawler

This is a NodeJS tool using the Puppeteer headless browser to crawl CodeHS.com for student grades.

## Installation

### Preferred Method
Use the package manager [npm](https://www.npmjs.com/) to install CodeHS Crawler.

```bash
$ npm install codehs_grades
```
>Note: Add the -g flag to use this tool anywhere; however, out files will have a different path from that of the working path.

### Alternative(Repo) Method
Clone this repository.
```bash
$ git clone https://github.com/e-zhang09/CodeHS-HWCrawler.git
$ cd CodeHS-HWCrawler
$ npm link
```
>Note: Git repo may be a few days behind
## Usage

```bash
$ codehs_grades
```

## Grading Method
### If assignment was finalized
Use points given by grader

### If assignment has been started
| Time Spent    | Points awarded    |
| -------------:|:-----------------:| 
| \> 60 minutes | MAX / MAX         | 
| \> 30 minutes | 0.5 * MAX / MAX   | 
| \> 15 minutes | 0.2 * MAX / MAX   | 
|      0 minute |   0 / MAX         |

> Note: Settings can be changed in `config.js` (**NOT YET**)

### If assignment hasn't been started
0 / MAX will be awarded

## Technical Details
### Calculating time spent
| Time elapsed\*    |  Time counted  | Reasoning |
| -------------:|:-----------------:| :---: |
|  30+ minutes | 3 minutes   | Could've went on break |
|      10-30 minutes |      2 minutes      | Could've been stuck on a part |
|0-10 minutes| 0.5 x elapsed| Not all time is spent on coding|
\*Time elapsed from last auto-save in history
> Note: Settings can be changed in `config.js` (**NOT YET**)  
> Note: All numbers are floored  

### Output file paths
*Will have more options soon*  

**If installed through npm i -g**  
On unix systems: `/usr/local/lib/node/codehs_grades/` or `/usr/local/lib/node_modules/codehs_grades/`  
On windows: `%USERPROFILE%\AppData\Roaming\npm\node_modules\codehs_grades\`  
  
**If installed through npm i**  
In the `node_modules/codehs_grades/` sub-folder of the install location

**If installed through git clone**  
In the `out` sub-folder of the project installation location

## Troubleshooting
##### Problem names in output are not matching input names
Delete the ./cached directory as problem IDs may have changed

##### Why are there '--' in each of the output fields?
The assignment may have been removed and could not be found, no real solutions as of right now.

##### ERROR: The process with PID \# (child process of PID \#) could not be terminated.
Could be ignored, may cause excessive memory usage?

##### Puppeteer sandbox issues
This tool does not support linux systems yet (mac may not work either)

## Contributing
Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.