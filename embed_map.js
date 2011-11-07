$('#chrome_mini_map_wrapper').remove();
$('body').prepend('<div id="chrome_mini_map_wrapper"></div>');

$('body').html2canvas();

var window_height = $(window).height();
var document_height = $(document).height();
var scroll_position = $(window).scrollTop();
var map_height = $('#chrome_mini_map_wrapper').height();

var viewport_percentage = (document_height / window_height) / 100;
var map_viewport = map_height * viewport_percentage;

console.log('window_height = ' + window_height);
console.log('document_height = ' + document_height);
console.log('scroll_position = ' + scroll_position);
console.log('map_height = ' + map_height);
console.log('viewport_percentage = ' + viewport_percentage);
console.log('map_viewport = ' + map_viewport);

$('#chrome_mini_map_wrapper').append('<hr class="window_bottom" />');
$('#chrome_mini_map_wrapper .window_bottom').css('top', map_viewport);