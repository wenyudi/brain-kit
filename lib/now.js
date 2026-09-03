'use strict';
// 跨平台时间戳。`node now.js` -> 2026-06-04T09:12；`node now.js id` -> 20260604T0912
const { stamp, idStamp } = require('./lib');
process.stdout.write(process.argv[2] === 'id' ? idStamp() : stamp());
