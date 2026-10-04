const { cp, access } = require('node:fs/promises');
const { join } = require('node:path');
/** @param {import('electron-builder').AfterPackContext} context */
module.exports = async context => {
  const root = context.packager.projectDir;
  const resources = join(context.appOutDir, 'Sector 7.app', 'Contents', 'Resources');
  await cp(join(process.env.SECTOR7_DESKTOP_STAGE ?? join(root, '.stage'), 'server'), join(resources, 'server'), { recursive: true, verbatimSymlinks: true });
  await access(join(resources, 'server', 'node_modules', 'next', 'package.json'));
};
