const fs = require('fs');

try {
    // 1. Read the JSON file
    const jsonString = fs.readFileSync('cookies.json', 'utf8');

    // 2. Convert the string to Base64
    const base64String = Buffer.from(jsonString).toString('base64');

    // 3. Print it to the console
    console.log('\n--- Your Base64 String ---\n');
    console.log(base64String);
    console.log('\n--------------------------\n');
    
    // 4. (Optional) Write it to a text file so you don't have to fight console text-selection
    fs.writeFileSync('cookies_base64.txt', base64String);
    console.log('Success! Base64 string also saved to cookies_base64.txt');

} catch (err) {
    console.error("Error: Make sure 'cookies.json' exists in the same folder.", err.message);
}