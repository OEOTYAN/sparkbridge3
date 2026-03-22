// scripts/generate-manifest.js
const fs = require('fs');
const path = require('path');

// 指向你准备打包的项目根目录
const targetDir = path.join(__dirname, '../');

// 🚨 黑名单：不需要被记录进更新清单的文件夹/文件
const ignoreList = [
    '.git',
    '.github',
    '.gitignore',
    'scripts',       // 打包脚本自己不需要发出去
    'temp',
    'logs',
    'testdata',
    'serverdata',
    'SparkBridgeDevelopTool',
];

function getFiles(dir, fileList = []) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const absolutePath = path.join(dir, file);
        // 获取相对路径，并统一替换为正斜杠 (兼容 Windows 和 Linux)
        const relativePath = path.relative(targetDir, absolutePath).replace(/\\/g, '/');

        // 检查是否在黑名单中
        if (ignoreList.some(ignoreItem => relativePath.startsWith(ignoreItem) || relativePath === ignoreItem)) {
            continue;
        }

        if (fs.statSync(absolutePath).isDirectory()) {
            getFiles(absolutePath, fileList);
        } else {
            fileList.push(relativePath);
        }
    }
    return fileList;
}

// 提取 package.json 里的版本号
const pkg = require(path.join(targetDir, 'package.json'));

const manifest = {
    version: pkg.version,
    build_time: new Date().toISOString(),
    files: getFiles(targetDir)
};

// 将清单写入根目录
const outputPath = path.join(targetDir, 'update-manifest.json');
fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2));

console.log(`✅ 成功生成 manifest.json，共记录 ${manifest.files.length} 个核心文件。`);