'use strict';

const PassThrough = require('stream').PassThrough;
const JSONStream = require('JSONStream');

const parseStream = require('./parse-stream');
const createQueue = require('./queue');
const createScrollState = require('./scroll-state');

module.exports = function createHitStream(retrieve) {
  const queue = createQueue();

  setupResponseHandling(queue);
  setupStreamQueuing(queue, retrieve);

  const json = JSONStream.stringify();
  const through = new PassThrough(); // because JSONStream is not stream2

  return queue.stream()
    .on('error', err => json.emit('error', err))
    .pipe(json)
    .on('error', err => through.emit('error', err))
    .pipe(through);
}

function setupResponseHandling(queue) {
  queue.lazyMap(stream => {
    return stream.on('response', (response) => {
      if (response.statusCode >= 300) {
        queue.error(new Error(`Unexpected status code ${response.statusCode}`));
      }
    });
  });
}

function setupStreamQueuing(queue, retrieve) {
  queue.enqueue(retrieve);

  const enqueueNext = (id) => {
    queue.enqueue(() => retrieve(id));
  };

  queue.lazyMap(stream => {
    const state = createScrollState(enqueueNext);
    return parseStream(stream, state.handleHit, state.handleScrollId, queue.error);
  });
}
