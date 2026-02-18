import { notarize } from '@electron/notarize';

export default async (context) => {
    if (process.platform !== 'darwin') return;
    if (context.packager.platform.name !== 'mac') return;

    if (!('APPLE_ID' in process.env && 'APPLE_ID_PASS' in process.env && 'APPLE_TEAM_ID' in process.env)) {
        console.warn('Skipping notarization: APPLE_ID, APPLE_ID_PASS, and APPLE_TEAM_ID env variables must be set.');
        return;
    }

    const { appOutDir } = context;
    const appName = context.packager.appInfo.productFilename;

    console.log(`Notarizing ${appName}...`);

    try {
        await notarize({
            appBundleId: 'com.vaxtly.app',
            appPath: `${appOutDir}/${appName}.app`,
            appleId: process.env.APPLE_ID,
            appleIdPassword: process.env.APPLE_ID_PASS,
            teamId: process.env.APPLE_TEAM_ID,
            tool: 'notarytool',
        });
    } catch (error) {
        console.error('Notarization failed:', error);
    }

    console.log('Notarization complete.');
};
