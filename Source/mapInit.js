function myMap() {
    var mapProp= {
      center:new google.maps.LatLng(38.582050319897576, -121.4957924551412),
      zoom:12,
    };
    var map = new google.maps.Map(document.getElementById("googleMap"),mapProp);
}