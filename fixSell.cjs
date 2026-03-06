const fs = require('fs');
let content = fs.readFileSync('src/App.jsx', 'utf8');

content = content.replace(
    'const sellSinglePulledCard = async (card) => {\n    if (actionLock.current) return;',
    'const sellSinglePulledCard = async (card) => {\n    if (actionLock.current) return;\n    if (card.maxSupply > 0) return showToast("Лімітовані картки не продаються системі", "error");'
);

content = content.replace(
    'const sellDuplicate = async (cardId, power = undefined, hp = undefined) => {\n    if (actionLock.current) return false;\n    actionLock.current = true;\n    setIsProcessing(true);',
    'const sellDuplicate = async (cardId, power = undefined, hp = undefined) => {\n    if (actionLock.current) return false;\n    const cardData = cardsCatalog.find((c) => c.id === cardId);\n    if (cardData && cardData.maxSupply > 0) { showToast("Лімітовані картки не продаються системі", "error"); return false; }\n    actionLock.current = true;\n    setIsProcessing(true);'
);

content = content.replace(
    'const sellAllDuplicates = async (cardId) => {\n    if (actionLock.current) return;\n    actionLock.current = true;\n    setIsProcessing(true);',
    'const sellAllDuplicates = async (cardId) => {\n    if (actionLock.current) return;\n    const cardData = cardsCatalog.find((c) => c.id === cardId);\n    if (cardData && cardData.maxSupply > 0) { showToast("Лімітовані картки не продаються системі", "error"); return; }\n    actionLock.current = true;\n    setIsProcessing(true);'
);

content = content.replace(
    'const duplicates = baseList.filter((item) => {\n        const keepAmount = item.card?.isGame ? 3 : 1;\n        return item.amount > keepAmount;\n      });',
    'const duplicates = baseList.filter((item) => {\n        if (item.card && item.card.maxSupply > 0) return false;\n        const keepAmount = item.card?.isGame ? 3 : 1;\n        return item.amount > keepAmount;\n      });'
);

fs.writeFileSync('src/App.jsx', content);
console.log('Done!');
