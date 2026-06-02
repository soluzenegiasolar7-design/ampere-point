import { Server } from 'socket.io'

let _io: Server | null = null

export function setIo(io: Server) { _io = io }
export function getIo() { return _io }
