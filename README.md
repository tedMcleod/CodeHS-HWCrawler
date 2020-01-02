# CodeHS Crawler

This is a [NodeJS](https://nodejs.org/) tool using the [Puppeteer](https://developers.google.com/web/tools/puppeteer) headless browser to crawl the [CodeHS](https://codehs.com) code teaching platform for a teacher's students' grades.

## Installation

### Preferred Method
Use the package manager [npm](https://www.npmjs.com/) to install CodeHS Crawler.

```bash
npm install codehs_grades
```
>Note: Add the -g flag to use this tool anywhere; however, out files will have a different path from that of the working path.

### Alternative(Repo) Method
Clone this repository.
```bash
git clone https://github.com/e-zhang09/CodeHS-HWCrawler.git
cd CodeHS-HWCrawler
npm link
```
>Note: outputs will be in the 'out' sub-directory

## Usage

```bash
codehs_grades
```

## Grading Method

### All assignments are out of 10 points.
##### If total time spent on assignment <code>>= 45</code> minutes
Award 10/10 pts for the assignment. 

##### If all exercises are completed (not "Not Submitted" or "Unopened")
Award 10/10 pts for the assignment. 

### If none of the above, loop through each <i>exercise</i> of the assignment <br/>(N is number of exercises in the assignment)
##### If time worked on <i>exercise</i> <code>>= 45 / N</code> minutes
Award the <i>exercise</i> <code>1</code> pt  .

##### If time worked on <i>exercise</i> <code>>= 45 / (N * 3)</code> minutes
Award the <i>exercise</i>  <code>M / (45 / N)</code> pt, where M is the minutes they worked on the exercise.  
(Rounding to the 2nd decimal place)

##### If none of the above
Award the <i>exercise</i> <code>0</code> pt.

>Note: 'Exercises' and 'assignments' are defined below.
## Technical Details
### Definition of Exercise vs Assignment
<b><i>Exercises</i></b> are the problems each student have to solve as an <b><i>assignment</i></b>.

### Calculating time spent on each exercise
Using edit sessions
- A session ends when there was more than 30 minutes between versions or when the last version is reached.  
- The duration of each session is the difference between the first and last version of the session.  
>Note: See [TimeCalculations.md](TimeCalculations.md) for example expected behaviors

### Output file paths
*Will have more options soon*  

**If installed through `npm install codehs_grades`**  
In the `node_modules/codehs_grades/` sub-folder of the install location

**If installed through `npm install codehs_grades -g`**  
On unix systems: `/usr/local/lib/node/codehs_grades/` or `/usr/local/lib/node_modules/codehs_grades/`  
On windows: `%USERPROFILE%\AppData\Roaming\npm\node_modules\codehs_grades\`  
  
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