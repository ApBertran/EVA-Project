const socket = io.connect('http://localhost:3000');

socket.on('connect', () => {
  console.log('Connected to server');
});

socket.on('gforce-update', (gForceArray) => {
  const needleX = document.getElementById('needle-x');
  const needleY = document.getElementById('needle-y');
  const needleZ = document.getElementById('needle-z');
  const gForceText = document.getElementById('g-force-text');

  // Scale factor for maximum g-force (3Gs)
  const maxG = 3;

  // Update needle rotations and lengths based on g-force
  needleX.style.transform = `translateX(-50%) translateY(-50%) rotate(${gForceArray[0] / maxG * 90}deg)`;
  needleY.style.transform = `translateX(-50%) translateY(-50%) rotate(${gForceArray[1] / maxG * 90}deg)`;
  needleZ.style.transform = `translateX(-50%) translateY(-50%) rotate(${gForceArray[2] / maxG * 90}deg)`;

  // Adjust needle lengths based on g-force magnitude (limit to maxG)
  needleX.style.height = `${Math.min(Math.abs(gForceArray[0] / maxG), 1) * 50}%`;
  needleY.style.height = `${Math.min(Math.abs(gForceArray[1] / maxG), 1) * 50}%`;
  needleZ.style.height = `${Math.min(Math.abs(gForceArray[2] / maxG), 1) * 50}%`;
  

  // Calculate total g-force and display it
  const totalGForce = Math.sqrt(gForceArray[0] ** 2 + gForceArray[1] ** 2 + gForceArray[2] ** 2).toFixed(2);
  gForceText.innerText = `${totalGForce} G`;

  // console.log('Received data:', gForceArray);
  // const xElement = document.getElementById('x-display');
  // const yElement = document.getElementById('y-display');
  // const zElement = document.getElementById('z-display');

  // xElement.textContent = gForceArray[0].toFixed(2);
  // yElement.textContent = gForceArray[1].toFixed(2);
  // zElement.textContent = gForceArray[2].toFixed(2);
});
