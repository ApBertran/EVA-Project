function openTab(evt, tabName) {
    var i, tabcontent, tablinks;
  
    // Hide all elements with class="tabcontent"
    tabcontent = document.getElementsByClassName("tabcontent");
    for(i = 0; i < tabcontent.length; i++) {
      tabcontent[i].style.display = "none";
    }
  
    // Remove "active" class from all elements with class="tablinks"
    tablinks = document.getElementsByClassName("tablinks");
    for (i = 0; i < tablinks.length; i++) {
      tablinks[i].className = tablinks[i].className.replace(" active", "");
    }
  
    // Show current tab and add "active" class to button
    document.getElementById(tabName).style.display = "block";
    evt.currentTarget.className += " active";
  
}