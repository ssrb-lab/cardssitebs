const https = require('https');
const fs = require('fs');
const path = require('path');

const url =
  'https://raw.githubusercontent.com/kkrypt0nn/wordlists/main/wordlists/languages/ukrainian.txt';

console.log('Fetching ukrainian wordlist...');
https
  .get(url, (res) => {
    let rawData = '';
    res.on('data', (chunk) => {
      rawData += chunk;
    });
    res.on('end', () => {
      try {
        const words = rawData.split('\n');
        const regex = /^[а-яіїєґ]{5}$/;
        const filteredWords = words.map((w) => w.trim().toLowerCase()).filter((w) => regex.test(w));

        const uniqueWords = [...new Set(filteredWords)];

        const dataDir = path.join(__dirname, 'data');
        if (!fs.existsSync(dataDir)) {
          fs.mkdirSync(dataDir);
        }

        fs.writeFileSync(path.join(dataDir, 'wordle_uk.json'), JSON.stringify(uniqueWords));
        console.log(`Successfully extracted ${uniqueWords.length} 5-letter Ukrainian words.`);
      } catch (e) {
        console.error('Error parsing dictionary:', e.message);
      }
    });
  })
  .on('error', (e) => {
    console.error(`Got error: ${e.message}`);
  });
