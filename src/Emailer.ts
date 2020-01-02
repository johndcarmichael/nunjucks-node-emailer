import path = require('path');
import fs from 'fs-extra';
import sgMail from '@sendgrid/mail';
import EmailerSendObject from '@/interfaces/EmailerSendObject';
import nunjucks from 'nunjucks';
import { EmailerSendTypes } from '@/enums/EmailerSendTypes';
import EmailerSend from '@/interfaces/EmailerSend';

class Emailer {
  public async send (emailerSend: EmailerSend): Promise<any> {
    if (!this.hasBeenInitialized()) {
      throw new Error('You must first call EmailerSetup before using the Emailer class.');
    }
    const messageObject = {
      from: emailerSend.from || global.OPENAPI_NODEGEN_EMAILER_SETTINGS.fallbackFrom,
      html: await this.renderTemplate(
        path.join(global.OPENAPI_NODEGEN_EMAILER_SETTINGS.tplPath, emailerSend.tplRelativePath + '.html.njk'),
        emailerSend.tplObject,
      ),
      subject: emailerSend.subject,
      text: await this.renderTemplate(
        path.join(global.OPENAPI_NODEGEN_EMAILER_SETTINGS.tplPath, emailerSend.tplRelativePath + '.txt.njk'),
        emailerSend.tplObject,
      ),
      to: emailerSend.to,
      tplObject: emailerSend.tplObject || {},
      tplRelativePath: emailerSend.tplRelativePath,
    };
    return await this.sendTo(messageObject);
  }

  public getLogFileNames (): Promise<string[]> {
    return new Promise((resolve, reject) => {
      fs.readdir(global.OPENAPI_NODEGEN_EMAILER_SETTINGS.logPath, function (err, files) {
        if (err) {
          console.error('Unable to scan directory: ' + global.OPENAPI_NODEGEN_EMAILER_SETTINGS.logPath);
          return reject(err);
        }
        return resolve(files);
      });
    });
  }

  public getLatestLogFileData (): Promise<any> {
    return new Promise(async (resolve, reject) => {
      fs.readJSON(
        path.join(
          global.OPENAPI_NODEGEN_EMAILER_SETTINGS.logPath,
          (await this.getLogFileNames()).pop(),
        ),
        (err, json) => {
          if (err) {
            return reject(err);
          }
          return resolve(json);
        });
    });
  }

  public removeAllEmailJsonLogFiles (): Promise<boolean> {
    return new Promise((resolve, reject) => {
      fs.emptyDir(global.OPENAPI_NODEGEN_EMAILER_SETTINGS.logPath, (err) => {
        if (err) {
          console.error('There was an error clearing the log folder');
          return reject(err);
        }
        return resolve(true);
      });
    });
  }

  private hasBeenInitialized () {
    return !(global.OPENAPI_NODEGEN_EMAILER_SETTINGS === undefined);
  }

  private calculateLogFilePath (tplRelPath: string) {
    return path.join(
      global.OPENAPI_NODEGEN_EMAILER_SETTINGS.logPath,
      new Date().getTime() + tplRelPath + '.json',
    );
  }

  private async renderTemplate (fullTemplatePath: string, templateObject?: any): Promise<string> {
    return new Promise((resolve, reject) => {
      fs.readFile(fullTemplatePath, 'utf8', (err, data) => {
        if (err) {
          return reject(err);
        }
        const env = nunjucks.configure({
          autoescape: false,
        });
        for (const key in global.OPENAPI_NODEGEN_EMAILER_SETTINGS.tplGlobalObject) {
          if (global.OPENAPI_NODEGEN_EMAILER_SETTINGS.tplGlobalObject.hasOwnProperty(key)) {
            env.addGlobal(key, global.OPENAPI_NODEGEN_EMAILER_SETTINGS.tplGlobalObject[key]);
          }
        }
        resolve(nunjucks.renderString(data, templateObject || {}));
      });
    });
  }

  private async sendTo (sendObject: EmailerSendObject) {
    const sendObjectWithGlobals = Object.assign(sendObject, {
      tplGlobalObject: global.OPENAPI_NODEGEN_EMAILER_SETTINGS.tplGlobalObject,
    });
    return new Promise((resolve) => {
      switch (global.OPENAPI_NODEGEN_EMAILER_SETTINGS.sendType) {
        case EmailerSendTypes.sendgrid:
          sgMail.setApiKey(process.env.SENDGRID_API_KEY);
          return resolve(sgMail.send(sendObjectWithGlobals));
        case EmailerSendTypes.return:
          return resolve(sendObjectWithGlobals);
        case EmailerSendTypes.log:
          console.log(sendObjectWithGlobals);
        // don't break here as log and file should write log to disk.
        case EmailerSendTypes.file:
          const filePath = this.calculateLogFilePath(sendObject.tplRelativePath);
          fs.writeFile(filePath, JSON.stringify(sendObjectWithGlobals), 'utf8', () => {
            return resolve(filePath);
          });
          break;
      }
    });
  }
}

export default new Emailer();
