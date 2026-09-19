import { redact } from "./redaction.js";
export class Logger {
    output;
    constructor(output = process.stderr) {
        this.output = output;
    }
    log(level, message, fields = {}) {
        const safeFields = redact(fields);
        this.output.write(`${JSON.stringify({ timestamp: new Date().toISOString(), level, message, ...(safeFields && typeof safeFields === "object" ? safeFields : {}) })}\n`);
    }
    debug(message, fields) { this.log("debug", message, fields); }
    info(message, fields) { this.log("info", message, fields); }
    warn(message, fields) { this.log("warn", message, fields); }
    error(message, fields) { this.log("error", message, fields); }
}
