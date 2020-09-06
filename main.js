const fs = require('fs');
const moment = require('moment-timezone');
const AWS = require('aws-sdk');
const { spawn } = require('child_process');
const PrometheusQuery = require('prometheus-query');

const BUCKET_NAME = 'hipstershop-k6';
const ACCESS_KEY = process.env.ACCESS_KEY;
const SECRET_KEY = process.env.SECRET_KEY;
const PROMETHEUS_URL = process.env.PROMETHEUS_URL || 'http://prometheus.istio-system.svc.cluster.local:9090';
const SCRIPT_PATH = process.env.SCRIPT_PATH || '/k6-script.js';
const METRICS_PATH = process.env.METRICS_PATH || '/metrics.json';
const TITLE = process.env.TITLE || 'k6';
const OUTPUT = '/tmp/output.json';

init();

function init() {
    const time = getTime();
    const title = `${TITLE}-${time}`;

    runTest(title);
}

function runTest(title) {
    const command = spawn('k6', ['run', `--summary-export=${OUTPUT}`, SCRIPT_PATH]);
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
            afterTest(title);
        }
    });
}

// Data, hora, e uma string qualquer que vc passar como parâmetro.
// A string viria primeiro, depois a data e por último a hora de início, com minutos d segundos.
function afterTest(title) {
    const time = getTime();
    const content = fs.readFileSync(OUTPUT);
    const p95 = JSON.parse(content).metrics.iteration_duration['p(95)'];
    uploadFile(title, 'summary.json', content);
    uploadFile(title, 'p95.txt', `${p95}`);
    queryPrometheus(title);

}

function queryPrometheus(title) {

    const content = fs.readFileSync(METRICS_PATH);
    const metrics = JSON.parse(content);

    metrics.forEach(metric => {
        console.log(`Run metric ${metric.name}`);
        executeQuery(metric, series => {
            uploadFile(title, `${metric.name}.json`, series);
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

function executeQuery(metric, callback) {
    const pq = new PrometheusQuery({
        endpoint: `${PROMETHEUS_URL}`,
        baseURL: "/api/v1"
    });

    pq.instantQuery(metric.query)
        .then((result) => {
            const series = result.result;
            callback(JSON.stringify(series, null, '\t'));
        })
        .catch(console.error);
}

function getTime() {
    const now = new Date();
    const timezone = moment(now).tz('America/Fortaleza');
    return timezone.format('YYYY-MM-DD-HH-mm-ss')
}