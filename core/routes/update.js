const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip'); // 需要 npm install adm-zip
const { getLogger } = require('../../handles/logger');
const logger = getLogger('Updater');

// 绝对不能覆盖或删除的“用户数据”保护黑名单
const PROTECTED_DIRS = ['plugins', 'base', 'logs', 'web', 'testdata'];

module.exports = (webManager) => {
    const router = express.Router();

    // POST /api/system/update
    // 触发自动更新
    router.post('/update', webManager.requireAuth, async (req, res) => {
        try {
            res.json({ code: 200, msg: '更新任务已在后台启动，请查看控制台日志...' });

            // 1. 获取云端更新信息
            logger.info('正在请求云端更新信息...');
            const cloudRes = await axios.get('https://你的云端接口域名/api/check-update');
            const updateData = cloudRes.data.data;

            // 2. 下载 ZIP 到临时目录
            const tempDir = path.join(__dirname, '../../../temp');
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

            const zipPath = path.join(tempDir, 'update.zip');
            const extractPath = path.join(tempDir, 'extract');

            logger.info(`正在下载新版本 v${updateData.version} ...`);
            const response = await axios({
                url: updateData.download_url,
                method: 'GET',
                responseType: 'stream'
            });

            const writer = fs.createWriteStream(zipPath);
            response.data.pipe(writer);

            writer.on('finish', async () => {
                logger.info('下载完成，正在解压...');

                // 3. 解压文件
                const zip = new AdmZip(zipPath);
                zip.extractAllTo(extractPath, true);

                // 4. 执行差异化覆盖逻辑
                logger.info('正在应用更新 (跳过受保护的用户数据)...');
                applyUpdate(extractPath, path.join(__dirname, '../../../'));

                // 5. 删除废弃的旧文件
                if (updateData.obsolete_files) {
                    updateData.obsolete_files.forEach(file => {
                        const targetPath = path.join(__dirname, '../../../', file);
                        if (fs.existsSync(targetPath)) {
                            fs.unlinkSync(targetPath);
                            logger.info(`已清理废弃文件: ${file}`);
                        }
                    });
                }

                // 6. 清理临时文件
                fs.rmSync(tempDir, { recursive: true, force: true });

                logger.info('🎉 更新文件部署完毕！即将退出进程，请使用守护进程(如 PM2/Bat)重新拉起。');

                // 延迟 2 秒后自杀，把重启工作交给外层的守护脚本
                setTimeout(() => {
                    process.exit(0);
                }, 2000);
            });

        } catch (error) {
            logger.error(`更新失败: ${error.message}`);
        }
    });

    return router;
};

/**
 * 递归复制并覆盖文件，但跳过受保护的目录
 * @param {string} src 源目录 (解压出的临时目录)
 * @param {string} dest 目标目录 (框架运行主目录)
 */
function applyUpdate(src, dest) {
    const items = fs.readdirSync(src);

    for (const item of items) {
        // 如果当前是根目录下的被保护文件夹，直接跳过！不覆盖！
        if (PROTECTED_DIRS.includes(item) && dest === path.join(__dirname, '../../../')) {
            logger.debug(`[保护机制] 跳过覆盖目录: ${item}`);
            continue;
        }

        const srcPath = path.join(src, item);
        const destPath = path.join(dest, item);

        const stat = fs.statSync(srcPath);
        if (stat.isDirectory()) {
            if (!fs.existsSync(destPath)) {
                fs.mkdirSync(destPath, { recursive: true });
            }
            applyUpdate(srcPath, destPath); // 递归深入
        } else {
            // 复制并覆盖文件
            try {
                fs.copyFileSync(srcPath, destPath);
            } catch (err) {
                // 如果遇到 EBUSY 报错，通常是因为 Windows 下自己覆盖自己正在运行的 js
                logger.error(`无法覆盖文件 ${item}, 可能是因为文件被占用: ${err.message}`);
            }
        }
    }
}