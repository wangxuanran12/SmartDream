// Windows 打包钩子：给主程序 exe 嵌入应用图标 + 版本信息。
// 替代 wine/rcedit（signAndEditExecutable: false 时 electron-builder 不会编辑 exe 资源），
// 纯 JS 实现（resedit），解决 exe 无图标、无版本信息导致杀软误报/隔离的问题。
const fs = require('node:fs');
const path = require('node:path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;

  const appOutDir = context.appOutDir;
  const exeName = `${context.packager.appInfo.productFilename}.exe`;
  const exePath = path.join(appOutDir, exeName);
  if (!fs.existsSync(exePath)) {
    throw new Error(`afterPack: executable not found: ${exePath}`);
  }

  const buildResources =
    context.packager.config.directories?.buildResources || 'build';
  const iconPath = path.join(context.packager.projectDir, buildResources, 'icon.ico');
  if (!fs.existsSync(iconPath)) {
    throw new Error(`afterPack: icon.ico not found: ${iconPath}`);
  }

  // resedit / pe-library v3 均为 ESM-only，CJS 中需通过各自的 /cjs 加载器异步加载
  const [{ load: loadPE }, { load: loadResEdit }] = [
    require('pe-library/cjs'),
    require('resedit/cjs'),
  ];
  const PELibrary = await loadPE();
  const ResEdit = await loadResEdit();

  const appInfo = context.packager.appInfo;
  const version = appInfo.version; // e.g. "1.0.0"
  const [vMajor, vMinor, vPatch] = version.split('.').map((n) => parseInt(n, 10));

  console.log(`\tafterPack: embedding icon & version info into ${exeName}`);

  const data = fs.readFileSync(exePath);
  const exe = PELibrary.NtExecutable.from(data);
  const res = PELibrary.NtExecutableResource.from(exe);

  // --- 图标：替换 exe 内所有 icon group（Electron.exe 自带默认图标组）---
  const iconFile = ResEdit.Data.IconFile.from(fs.readFileSync(iconPath));
  const iconItems = iconFile.icons.map((item) => item.data);
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
  const langUS = 1033; // en-US
  for (const group of groups) {
    ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
      res.entries,
      group.id,
      group.lang ?? langUS,
      iconItems
    );
  }

  // --- 版本信息：改写 exe 已有的 VERSIONINFO（Electron.exe 自带）---
  const viList = ResEdit.Resource.VersionInfo.fromEntries(res.entries);
  const vi = viList[0] ?? ResEdit.Resource.VersionInfo.createEmpty();
  vi.setFileVersion(vMajor, vMinor, vPatch, 0, langUS);
  vi.setProductVersion(vMajor, vMinor, vPatch, 0, langUS);
  const strings = {
    FileDescription: appInfo.productName,
    ProductName: appInfo.productName,
    OriginalFilename: exeName,
  };
  if (appInfo.copyright) strings.LegalCopyright = appInfo.copyright;
  // 必须覆盖 Electron.exe 自带的 CompanyName（GitHub, Inc.），避免与 ProductName 不一致触发杀软误报
  strings.CompanyName = appInfo.companyName || appInfo.productName;
  vi.setStringValues({ lang: langUS, codepage: 1200 }, strings);
  vi.outputToResourceEntries(res.entries);

  res.outputResource(exe);
  fs.writeFileSync(exePath, Buffer.from(exe.generate()));
  console.log(`\tafterPack: done (${exePath})`);
};
