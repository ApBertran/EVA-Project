// const downloadToFile = (content, filename, contentType) => {
//     const a = document.createElement('a');
//     const file = new Blob([content], {type: contentType});
    
//     a.href= URL.createObjectURL(file);
//     a.download = filename;
//     a.click();
  
//       URL.revokeObjectURL(a.href);
//   };
  
//   document.querySelector('#btnSave').addEventListener('click', () => {
//     const textArea = document.querySelector('textarea');
    
//     downloadToFile(textArea.value, 'my-new-file.txt', 'text/plain');
//   });






let data = "";

function updateData() {
    // data = rSlider.value + " " + gSlider.value + " " + bSlider.value;
    // fs.writeFile('pytest.txt', data, (err) => {
    //     if (err) throw err;
    // })
    const temp = "temp";
}

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
  updateData();
}

// Green Output
gOutput.innerHTML = gSlider.value;
gSlider.oninput = function() {
  gOutput.innerHTML = this.value;
  document.documentElement.style.setProperty(`--greenVal`, gSlider.value);
  updateData();
}

// Blue Output
bOutput.innerHTML = bSlider.value;
bSlider.oninput = function() {
  bOutput.innerHTML = this.value;
  document.documentElement.style.setProperty(`--blueVal`, bSlider.value);
  updateData();
}
