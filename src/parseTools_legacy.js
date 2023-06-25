/**
 * @license
 * Copyright 2010 The Emscripten Authors
 * SPDX-License-Identifier: MIT
 */

// Takes a pair of return values, stashes one in tempRet0 and returns the other.
// Should probably be renamed to `makeReturn64` but keeping this old name in
// case external JS library code uses this name.
function makeStructuralReturn(values) {
  assert(values.length == 2);
  return 'setTempRet0(' + values[1] + '); return ' + asmCoercion(values[0], 'i32');
}

// Replaced (at least internally) with receiveI64ParamAsI53 that does
// bounds checking.
function receiveI64ParamAsDouble(name) {
  if (WASM_BIGINT) {
    // Just convert the bigint into a double.
    return `${name} = Number(${name});`;
  }
  // Combine the i32 params. Use an unsigned operator on low and shift high by
  // 32 bits.
  return `var ${name} = ${name}_high * 0x100000000 + (${name}_low >>> 0);`;
}

function receiveI64ParamAsI32s(name) {
  if (WASM_BIGINT) {
    return `var ${name}_low = Number(${name} & 0xffffffffn) | 0, ${name}_high = Number(${name} >> 32n) | 0;`;
  }
  return '';
}

function stripCorrections(param) {
  let m;
  while (true) {
    if (m = /^\((.*)\)$/.exec(param)) {
      param = m[1];
      continue;
    }
    if (m = /^\(([$_\w]+)\)&\d+$/.exec(param)) {
      param = m[1];
      continue;
    }
    if (m = /^\(([$_\w()]+)\)\|0$/.exec(param)) {
      param = m[1];
      continue;
    }
    if (m = /^\(([$_\w()]+)\)\>>>0$/.exec(param)) {
      param = m[1];
      continue;
    }
    if (m = /CHECK_OVERFLOW\(([^,)]*),.*/.exec(param)) {
      param = m[1];
      continue;
    }
    break;
  }
  return param;
}

const UNROLL_LOOP_MAX = 8;

function makeCopyValues(dest, src, num, type, modifier, align, sep = ';') {
  assert(typeof align === 'undefined');
  function unroll(type, num, jump = 1) {
    const setValues = range(num).map((i) => makeSetValue(dest, i * jump, makeGetValue(src, i * jump, type), type));
    return setValues.join(sep);
  }
  // If we don't know how to handle this at compile-time, or handling it is best
  // done in a large amount of code, call memcpy
  if (!isNumber(num)) num = stripCorrections(num);
  if (!isNumber(align)) align = stripCorrections(align);
  if (!isNumber(num) || (parseInt(num) / align >= UNROLL_LOOP_MAX)) {
    return '(_memcpy(' + dest + ', ' + src + ', ' + num + ')|0)';
  }
  num = parseInt(num);
  // remove corrections, since we will be correcting after we add anyhow,
  dest = stripCorrections(dest);
  src = stripCorrections(src);
  // and in the heap assignment expression
  const ret = [];
  [4, 2, 1].forEach((possibleAlign) => {
    if (num == 0) return;
    if (align >= possibleAlign) {
      ret.push(unroll('i' + (possibleAlign * 8), Math.floor(num / possibleAlign), possibleAlign));
      src = getFastValue(src, '+', Math.floor(num / possibleAlign) * possibleAlign);
      dest = getFastValue(dest, '+', Math.floor(num / possibleAlign) * possibleAlign);
      num %= possibleAlign;
    }
  });
  return ret.join(sep);
}

function makeMalloc(source, param) {
  return `_malloc(${param})`;
}

function getNativeFieldSize(type) {
  return Math.max(getNativeTypeSize(type), POINTER_SIZE);
}

global.Runtime = {
  getNativeTypeSize,
  getNativeFieldSize,
  POINTER_SIZE,
  QUANTUM_SIZE: POINTER_SIZE,
};

global.ATMAINS = [];

function addAtMain(code) {
  assert(HAS_MAIN, 'addAtMain called but program has no main function');
  ATMAINS.push(code);
}

function receiveI64ParamAsI53(name, onError) {
  if (WASM_BIGINT) {
    // Just convert the bigint into a double.
    return `${name} = bigintToI53Checked(${name}); if (isNaN(${name})) return ${onError};`;
  }
  // Convert the high/low pair to a Number, checking for
  // overflow of the I53 range and returning onError in that case.
  return `var ${name} = convertI32PairToI53Checked(${name}_low, ${name}_high); if (isNaN(${name})) return ${onError};`;
}

function defineI64Param(name) {
  return declareI64Param(name);
}
