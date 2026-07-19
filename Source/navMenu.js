function initTabs() {
    document.getElementsByClassName("tablinks")[0].click();
}

function openTab(evt, tabName) {
    var i, tabcontent, tablinks;

    tabcontent = document.getElementsByClassName("tabcontent");
    for (i = 0; i < tabcontent.length; i++) {
      tabcontent[i].classList.remove("shown");
    }

    tablinks = document.getElementsByClassName("tablinks");
    for (i = 0; i < tablinks.length; i++) {
      tablinks[i].classList.remove("active");
    }

    document.getElementById(tabName).classList.add("shown");
    evt.currentTarget.classList.add("active");
}
