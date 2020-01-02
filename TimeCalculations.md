## CASE 1: DUE DATE DURING A SESH 
due = 5

1   
2  


4  
5  
6  


8  
9  


prev = 1, cur = 1, running = 0, beforeDue = null, numSesh = 0  
is cur null? false  
-> continue  
-> numSesh += 1 // 1  

is delta > 1? false  
-> cur - prev = 1 - 1 = 0  
is cur > due? false  
-> running += 0 // 0  
cur = 2, prev = cur = 1  
is cur null ? false  
-> continue  

is delta > 1? false  
-> cur - prev = 2 - 1 = 1  
is cur > due? false  
-> running += 1 // 1  
cur = 4, prev = cur = 2  
is cur null ? false  
-> continue  

is delta > 1? true  
-? numSesh += 1 // 2  
cur = 5, prev = 4  
is cur null? false  

is delta > 1? false  
-> cur - prev = 5 - 4 = 1  
is cur > due? false  
-> running += 1 // 2  
cur = 6, prev = cur = 5  
is cur null ? false  
-> continue  

is delta > 1? false  
-> cur - prev = 6 - 5 = 1  
is cur > due && !beforeDue ? true  
-> beforeDue = running // 2  
-> running += 1 // 3  
cur = 8, prev = cur = 6  
is cur null ? false  
-> continue  

is delta > 1? true  
-? numSesh += 1 // 3  
cur = 9, prev = 8  
is cur null? false  

is delta > 1? false  
-> cur - prev = 9 - 8 = 1  
is cur > due && !beforeDue ? false  
-> running += 1 // 4  
cur = null, prev = cur = 9  
is cur null ? true  

is !beforeDue? false  

-> return // running = 4, beforeDue = 2, numSesh = 3  


## CASE 2: DUE DATE BEFORE SESHS


due = 0

1  
2  

4  
5  
6  


8  
9  


prev = 1, cur = 1, running = 0, beforeDue = null, numSesh = 0  
is cur null? false  
-> continue  
-> numSesh += 1 // 1  

is delta > 1? false  
-> cur - prev = 1 - 1 = 0  
is cur > due && !beforeDue? true  
-> beforeDue = running // 0   
-> running += 0 // 0  
cur = 2, prev = cur = 1  
is cur null ? false  
-> continue  

is delta > 1? false  
-> cur - prev = 2 - 1 = 1  
is cur > due? false  
-> running += 1 // 1  
cur = 4, prev = cur = 2  
is cur null ? false  
-> continue  

is delta > 1? true  
-? numSesh += 1 // 2  
cur = 5, prev = 4  
is cur null? false  

is delta > 1? false  
-> cur - prev = 5 - 4 = 1  
is cur > due? false  
-> running += 1 // 2  
cur = 6, prev = cur = 5  
is cur null ? false  
-> continue  

is delta > 1? false  
-> cur - prev = 6 - 5 = 1  
is cur > due && !beforeDue ? false  
-> running += 1 // 3  
cur = 8, prev = cur = 6  
is cur null ? false  
-> continue  

is delta > 1? true  
-? numSesh += 1 // 3  
cur = 9, prev = 8  
is cur null? false  

is delta > 1? false  
-> cur - prev = 9 - 8 = 1  
is cur > due && !beforeDue ? false  
-> running += 1 // 4  
cur = null, prev = cur = 9  
is cur null ? true  

is !beforeDue? false  

-> return // running = 4, beforeDue = 0, numSesh = 3  


## CASE 3: DUE DATE AFTER SESHS  
due = 10  

1  
2  


4  
5   
6  


8  
9  


prev = 1, cur = 1, running = 0, beforeDue = null, numSesh = 0  
is cur null? false  
-> continue  
-> numSesh += 1 // 1  

is delta > 1? false  
-> cur - prev = 1 - 1 = 0  
is cur > due && !beforeDue? false  
-> running += 0 // 0  
cur = 2, prev = cur = 1  
is cur null ? false  
-> continue  

is delta > 1? false  
-> cur - prev = 2 - 1 = 1  
is cur > due? false  
-> running += 1 // 1  
cur = 4, prev = cur = 2  
is cur null ? false  
-> continue  

is delta > 1? true  
-? numSesh += 1 // 2  
cur = 5, prev = 4  
is cur null? false  

is delta > 1? false  
-> cur - prev = 5 - 4 = 1  
is cur > due? false  
-> running += 1 // 2  
cur = 6, prev = cur = 5  
is cur null ? false  
-> continue  

is delta > 1? false  
-> cur - prev = 6 - 5 = 1  
is cur > due && !beforeDue ? false  
-> running += 1 // 3  
cur = 8, prev = cur = 6  
is cur null ? false  
-> continue  

is delta > 1? true  
-? numSesh += 1 // 3  
cur = 9, prev = 8  
is cur null? false  

is delta > 1? false  
-> cur - prev = 9 - 8 = 1  
is cur > due && !beforeDue ? false  
-> running += 1 // 4  
cur = null, prev = cur = 9  
is cur null ? true  

is !beforeDue? true  
-> beforeDue = running // 4  

-> return // running = 4, beforeDue = 4, numSesh = 3  
