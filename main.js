const fs = require('fs');
const AWS = require('aws-sdk');
const moment = require('moment');
const sort = require('fast-sort');
const { parse } = require('json2csv');
const { spawn } = require('child_process');
const PrometheusQuery = require('prometheus-query');

const BUCKET_NAME = 'hipstershop-k6';
const ACCESS_KEY = process.env.ACCESS_KEY;
const SECRET_KEY = process.env.SECRET_KEY;
const PROMETHEUS_URL = process.env.PROMETHEUS_URL || 'http://prometheus.istio-system.svc.cluster.local:9090';
const SCRIPT_PATH = process.env.SCRIPT_PATH || '/k6-script.js';
const METRICS_PATH = process.env.METRICS_PATH || '/metrics.json';
const NUMBER_EXECUTIONS = parseInt(process.env.NUMBER_EXECUTIONS || 3);
const TITLE = process.env.TITLE || 'k6';
const OUTPUT = '/tmp/output.json';

init();

function init() {
    test(1);
}

function test(iteration) {

    console.info('Test iteration: ' + iteration);

    runTest(iteration);
}

function runTest(iteration) {
    const command = spawn('k6', ['run', `--summary-export=${OUTPUT}`, SCRIPT_PATH]);
    const now = moment();
    command.stdout.on('data', data => {
        console.log(`${data}`);
    });

    command.stderr.on('data', data => {
        console.error(`stderr: ${data}`);
    });

    command.on('error', (error) => {
        console.error(`error: ${error.message}`);
    });

    command.on('close', code => {
        console.log(`child process exited with code ${code}`);
        if (code === 0) {
            const end = moment();
            const duration = end.diff(now, 'seconds') + 's';
            setTimeout(() => {
                afterTest(iteration, duration);
            }, 30000);
            // afterTest(iteration, duration);
        }
    });
}

function afterTest(iteration, duration) {
    const content = fs.readFileSync(OUTPUT);
    const summary = JSON.parse(content);

    if (summary.metrics &&
        summary.metrics.iteration_duration &&
        typeof summary.metrics.iteration_duration['p(95)'] !== 'undefined') {
        const p95 = summary.metrics.iteration_duration['p(95)'];
        uploadFile(TITLE, `p95-${iteration}.txt`, `${p95}`);
    }

    uploadFile(TITLE, `summary-${iteration}.json`, content);
    queryPrometheus(TITLE, iteration, duration);

    if (++iteration <= NUMBER_EXECUTIONS) {
        test(iteration)
    }
}

function queryPrometheus(folder, iteration, duration) {

    const content = fs.readFileSync(METRICS_PATH);
    const metrics = JSON.parse(content);

    metrics.forEach(metric => {
        console.log(`Run metric ${metric.name}`);
        executeQuery(metric, duration, series => {
            const name = `${metric.name}-${iteration}.csv`;
            uploadFile(folder, name, series);
        });
        console.log('Finished');
    });
}

function getS3() {
    // s3.config.update({region: 'us-west-2'});
    return new AWS.S3({
        accessKeyId: ACCESS_KEY,
        secretAccessKey: SECRET_KEY
    });
}

function uploadFile(folder, file, content) {

    // Setting up S3 upload parameters
    const params = {
        Bucket: BUCKET_NAME,
        Key: `${folder}/${file}`,
        Body: content
    };

    // Uploading files to the bucket
    getS3().upload(params, (err, data) => {
        if (err) {
            throw err;
        }
        console.log(`File uploaded successfully. ${data.Location}`);
    });
};

function executeQuery(metric, duration, callback) {
    const pq = new PrometheusQuery({
        endpoint: `${PROMETHEUS_URL}`,
        baseURL: '/api/v1'
    });

    const query = metric.query.replace(/\${DURATION}/g, duration);
    pq.instantQuery(query)
        .then(result => {
            if (result.result && result.result.length > 0) {
                let series = result.result.map(serie => {
                    return {
                        ...serie.metric.labels,
                        value: serie.value.value
                    };
                });

                let opts = {
                    includeEmptyRows: true
                };

                if (metric.columns && metric.columns.length > 0) {
                    opts = Object.assign(opts, {
                        fields: metric.columns
                    });
                }

                if (metric.sort && metric.sort.length > 0) {
                    sort(series).asc(metric.sort);
                }
    
                const csv = parse(series, opts);
                callback(csv);
            }
        })
        .catch(console.error);
}