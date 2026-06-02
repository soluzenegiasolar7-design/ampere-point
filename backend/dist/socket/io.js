"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setIo = setIo;
exports.getIo = getIo;
let _io = null;
function setIo(io) { _io = io; }
function getIo() { return _io; }
