/*
 * jQuery helper plugin for html2canvas
 */
			
(function( $ ){
    $.fn.html2canvas = function(options) {
        var preload = html2canvas.Preload(this[0], {
            "complete": function(images){
                
                var queue = html2canvas.Parse(this[0], images);
               
                var canvas = $(html2canvas.Renderer(queue));
          
                canvas.css('width', '300px');
                $('#chrome_mini_map_wrapper').append(canvas);                 
            }
        });
    };
})( jQuery );