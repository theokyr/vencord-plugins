export const streamPresetsMatcher = /let (\i)=\[(\{resolution:0,fps:60[\s\S]+?\{resolution:480,fps:5\})\];function (\i)\(/;

export const resolutionOptionsMatcher = /(let |,)(\i)=\[((\i)\(480,\(\)=>(\i)\(480\)\),\4\(720,\(\)=>\5\(720\)\),\4\(1080,\(\)=>\5\(1080\)\),\4\(1440,\(\)=>\5\(1440\)\),\4\(0,\(\)=>\5\(0\)\))\]/;

export const fpsOptionsMatcher = /let (\i)=\[((\i)\(15,\(\)=>\i\.intl\.formatToPlainString\(\i\.t\["[^"]+"\],\{value:15\}\)\),\3\(30,\(\)=>\i\.intl\.formatToPlainString\(\i\.t\["[^"]+"\],\{value:30\}\)\),\3\(60,\(\)=>\i\.intl\.formatToPlainString\(\i\.t\["[^"]+"\],\{value:60\}\)\))\]/;
