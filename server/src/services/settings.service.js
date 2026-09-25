import { executeReadOnlyQuery } from './database.service.js';

function mapPublicSettingRow(row) {
  return {
    settingKey: row.SettingKey,
    settingValue: row.SettingValue,
    settingType: row.SettingType,
  };
}

export async function getPublicSettings() {
  const text = `
    SELECT SettingKey,
           SettingValue,
           SettingType
    FROM dbo.SB_Settings
    WHERE IsActive = 1
    ORDER BY SettingKey
  `;
  const rows = await executeReadOnlyQuery(text, []);
  return rows.map(mapPublicSettingRow);
}
