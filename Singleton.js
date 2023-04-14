let sequenceNumber;
let timerInterval = 10;
let timer;
function timerRun() {
  timer++;
  if (timer == 4294967295) {
    timer = Math.floor(1000 * Math.random()); // reset timer to be within 32 bit size
  }
}
module.exports = {
  init: function () {
    // set timestamp
    timer = Math.floor(1000 * Math.random()); /* any random number */
    setInterval(timerRun, timerInterval);
    sequenceNumber = Math.floor(1000 * Math.random()); /* any random number */
  },

  //--------------------------
  //getTimestamp: return the current timer value
  //--------------------------
  getTimestamp: function () {
    //return  the current value of the server's timer
    return timer;
  },
  getSequenceNumber: function () {
    sequenceNumber++;
    return sequenceNumber;
  },
};
