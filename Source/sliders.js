// function componentToHex(c) {
//     let hex = c.toString(16);
//     return hex.length == 1 ? "0" + hex : hex;
//   }
//   function rgbToHex(r, g, b) {
//     return "#" + componentToHex(r) + componentToHex(g) + componentToHex(b);
//   }

// Red Setup
var rSlider = document.getElementById("redRange");
var rOutput = document.getElementById("redVal");
// Green Setup
var gSlider = document.getElementById("greenRange");
var gOutput = document.getElementById("greenVal");
// Blue Setup
var bSlider = document.getElementById("blueRange");
var bOutput = document.getElementById("blueVal");

// Red Output
rOutput.innerHTML = rSlider.value;
rSlider.oninput = function() {
  rOutput.innerHTML = this.value;
  document.documentElement.style.setProperty(`--redVal`, rSlider.value);
}

// Green Output
gOutput.innerHTML = gSlider.value;
gSlider.oninput = function() {
  gOutput.innerHTML = this.value;
  document.documentElement.style.setProperty(`--greenVal`, gSlider.value);
}

// Blue Output
bOutput.innerHTML = bSlider.value;
bSlider.oninput = function() {
  bOutput.innerHTML = this.value;
  document.documentElement.style.setProperty(`--blueVal`, bSlider.value);
}