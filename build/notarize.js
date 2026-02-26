const { notarize } = require('@electron/notarize');
const { execSync } = require('child_process');

module.exports = async (context) => {
    if (process.platform !== 'darwin') return;
    if (context.packager.platform.name !== 'mac') return;

    const { appOutDir } = context;
    const appName = context.packager.appInfo.productFilename;
    const appPath = `${appOutDir}/${appName}.app`;

    if (!('APPLE_ID' in process.env && 'APPLE_ID_PASS' in process.env && 'APPLE_TEAM_ID' in process.env)) {
        console.warn('Skipping notarization: APPLE_ID, APPLE_ID_PASS, and APPLE_TEAM_ID env variables must be set.');

        // Re-sign the entire bundle with a single consistent ad-hoc identity.
        // electron-builder signs binaries separately, which creates distinct ad-hoc
        // identities that macOS 15+ dyld rejects as "different Team IDs".
        console.log(`Re-signing ${appName}.app with consistent ad-hoc identity...`);
        execSync(`codesign --force --deep -s - "${appPath}"`, { stdio: 'inherit' });

        return;
    }

    console.log(`Notarizing ${appName}...`);

    await notarize({
        appBundleId: 'com.vaxtly.app',
        appPath,
        appleId: process.env.APPLE_ID,
        appleIdPassword: process.env.APPLE_ID_PASS,
        teamId: process.env.APPLE_TEAM_ID,
        tool: 'notarytool',
    });

    console.log('Notarization complete.');
};
