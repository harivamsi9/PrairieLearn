import { assert } from 'chai';
import _ from 'lodash';

import * as sqldb from '@prairielearn/postgres';

import * as cron from '../cron/index.js';
import { config } from '../lib/config.js';

import * as helperServer from './helperServer.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

describe('Cron', function () {
  this.timeout(60000);

  before('set up testing server', async function () {
    // set config.cronDailyMS so that daily cron jobs will execute soon
    const now = Date.now();
    const midnight = new Date(now).setHours(0, 0, 0, 0);
    const sinceMidnightMS = now - midnight;
    const dayMS = 24 * 60 * 60 * 1000;
    const timeToNextMS = 15 * 1000;
    const cronDailyMS = (timeToNextMS + sinceMidnightMS) % dayMS;
    config.cronDailySec = cronDailyMS / 1000;

    // set all other cron jobs to execute soon
    config.cronOverrideAllIntervalsSec = 3;

    await helperServer.before().call(this);
  });
  after('shut down testing server', helperServer.after);

  describe('1. cron jobs', () => {
    it('should wait for 20 seconds', (callback) => {
      setTimeout(callback, 20000);
    });

    it('should all have started', async () => {
      const result = await sqldb.queryAsync(sql.select_cron_jobs, []);
      const runJobs = result.rows.map((row) => row.name);
      const cronJobs = cron.jobs.map((row) => row.name);
      assert.lengthOf(_.difference(runJobs, cronJobs), 0);
      assert.lengthOf(_.difference(cronJobs, runJobs), 0);
    });

    it('should all have successfully completed', async () => {
      const result = await sqldb.queryAsync(sql.select_unsuccessful_cron_jobs, []);
      assert.lengthOf(result.rows, 0);
    });
  });
});
