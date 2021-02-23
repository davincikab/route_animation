mapboxgl.accessToken = 'pk.eyJ1IjoiZGF1ZGk5NyIsImEiOiJjanJtY3B1bjYwZ3F2NGFvOXZ1a29iMmp6In0.9ZdvuGInodgDk7cv-KlujA';
var map = new mapboxgl.Map({
    container: 'map', 
    style: 'mapbox://styles/daudi97/ckdvhhd7i0rcp19nwbpy3opob', 
    center: [36.82102738190838, -1.286369444810333],
    zoom: 14.75,
    bearing:17,
    pitch:0
});

var animationFrame;
var previousBearing = 17;
var previousDBearing = 0;
var animationMode = false;
var startTime;
let element = document.createElement('div');
element.setAttribute('class', 'map-marker');

var headerMarker = new mapboxgl.Marker({
    element:element
});

var trackChunks =[];
let geojson = {
    "type": "FeatureCollection",
    "features": [
      {
        "type": "Feature",
        "properties": {},
        "geometry": {
          "type": "LineString",
          "coordinates": []
        }
      }
    ]
};

function animate({timing, draw, duration}) {
    let start = performance.now();

    animationFrame = requestAnimationFrame(function animate(time) {
        // timeFraction goes from 0 to 1
        let timeFraction = (time - start) / duration;
        if (timeFraction > 1) timeFraction = 1;

        // calculate the current animation state
        let progress = timing(timeFraction)

        draw(progress); // draw it

        if (timeFraction < 1) {
            requestAnimationFrame(animate);
        }
    })
}

function draw(progress) {
    map.setPitch(progress * 60);
}

function animatePitch() {
    animate({
        timing:linear,
        draw:draw,
        duration:1000
    });
}

// timing function
function linear(timeFraction) {
    return timeFraction;
}

function square(timeFraction) {
    return Math.pow(timeFraction, 2);
}

function exponential(timeFraction) {
    return Math.exp(timeFraction);
}

function distanceTo(p1, p2) {
    var from = turf.point(p1);
    var to = turf.point(p2);
    var options = {units: 'kilometres'};
    var distance = turf.distance(from, to, options);
    return distance * 1000;
}

function createChunks(latlngs, distance=10) {
    var i,
        len = latlngs.length,
        chunkedLatLngs = [];

    for (i=1;i<len;i++) {
      var cur = latlngs[i-1],
          next = latlngs[i],
          dist = distanceTo(cur, next),
          factor = distance / dist,
          dLat = factor * (next[1] - cur[1]),
          dLng = factor * (next[0] - cur[0]);

      if (dist > distance) {
        while (dist > distance) {
          cur = [cur[1] + dLat, cur[0] + dLng].reverse();
          dist = distanceTo(cur, next);
          chunkedLatLngs.push(cur);
        }

        chunkedLatLngs.push(cur);
      } else {
        chunkedLatLngs.push(cur);
      }
    }
    chunkedLatLngs.push(latlngs[len-1]);

    return chunkedLatLngs;
}

// Map Control
class AnimationControl {
    onAdd(map) {
        this._map = map;
        this._container = document.createElement('div');
        this._container.className = 'mapboxgl-ctrl';

        let div = document.createElement('div');
        div.classList.add('animation-control');

        let playButton = document.createElement('button');
        playButton.classList.add("btn");
        playButton.innerHTML = "<i class='fa fa-play'><i/>";


        playButton.addEventListener('click', function(e) {

            if(!animationMode) {
                map.setZoom(16.75);
                animatePitch();

                setTimeout(function(e){
                    animateLine();
                }, 1000);
                

                map.setLayoutProperty('3d-buildings', 'visibility','visible');

                animationMode = !animationMode;
                playButton.innerHTML = "<i class='fa fa-stop'><i/>";
            } else {
                cancelAnimationFrame(animationFrame);
                animationMode = !animationMode
                playButton.innerHTML = "<i class='fa fa-play'><i/>";
            }
            
        });

        div.append(playButton);

        let distanceDiv = document.createElement('div');
        distanceDiv.classList.add('distance-travelled');
        distanceDiv.setAttribute('id', 'distance-travelled');

        distanceDiv.innerHTML = "Distance";

        div.append(distanceDiv);

        // time div
        let timeDiv = document.createElement('div');
        timeDiv.classList.add('distance-travelled');
        timeDiv.setAttribute('id', 'time-taken');

        timeDiv.innerHTML = "Time";

        div.append(timeDiv);

        this._container.append(div);
        return this._container;
    }

    onRemove() {
        this._container.parentNode.removeChild(this._container);
        this._map = undefined;
    }
}

map.addControl(new AnimationControl(), 'top-left');

// Call to animate function
map.on('load', function(e) {
    map.addSource('path', {
        'type':'geojson',
        'data':{
            "type": "FeatureCollection",
            "features": []
        }
    });

    map.addLayer({
        'id':'route',
        'source':'path',
        'type':'line',
        'layout':{

        },
        'paint':{
            'line-color':'#d01212',
            'line-width':3
        }
    });

    // 3d building
    map.addLayer(
        {
        'id': '3d-buildings',
        'source': 'composite',
        'source-layer': 'building',
        'filter': ['==', 'extrude', 'true'],
        'type': 'fill-extrusion',
        'minzoom': 15,
        'paint': {
            'fill-extrusion-color': [
                'interpolate',
                ['linear'],
                ['get', 'height'],
                4,
                "#9a9a9a",
                50,
                "#595959"
            ],
            
            // use an 'interpolate' expression to add a smooth transition effect to the
            // buildings as the user zooms in
            'fill-extrusion-height': [
                'interpolate',
                ['linear'],
                ['zoom'],
                15,
                0,
                15.05,
                ['get', 'height']
            ],
            'fill-extrusion-base': [
                'interpolate',
                ['linear'],
                ['zoom'],
                15,
                0,
                15.05,
                ['get', 'min_height']
            ],
            'fill-extrusion-opacity': 0.85
        },
        'layout':{
            'visibility':'none'
        }
        }
    );  

    // fetch the data
    fetch('map.geojson')
    .then(response => response.json())
    .then(data => {
        // create the chunks
        trackChunks = createChunks(data.features[0].geometry.coordinates);

    });

    // header marker
});


function animateLine() {
    if(geojson.features[0].geometry.coordinates.length > 0) {
        // reset geojson feature
        geojson.features[0].geometry.coordinates = [];
        // update the map source
        map.getSource('path').setData(geojson);
    }

   startTime = new Date();
    animate({
        duration:25000,
        draw:drawLine,
        timing:linear
    });

    console.timeEnd("Animate Line");
}


function drawLine(progress) {
    // update the coordinates
    var index = (trackChunks.length - 1) * progress;
    index = index.toFixed();

    index = parseInt(index);
    if(index < 0) {
        return;
    }

    if(!geojson.features[0].geometry.coordinates[index]) {
        let coordinates = trackChunks[index];

        // create the geojson
        geojson.features[0].geometry.coordinates.push(coordinates);

        // update the map source
        map.getSource('path').setData(geojson);

        let distance = turf.length(geojson);

        let distanceDiv = document.getElementById('distance-travelled');
        distanceDiv.innerHTML = "Distance: " + (distance * 1000).toFixed(2) + " m";

        // transition map bearing
        if(trackChunks[index] && trackChunks[index + 1]) {
            let from  = turf.point(trackChunks[index]);
            let to = turf.point(trackChunks[index + 1]);

            var bearing = turf.bearing(from, to);
            bearing = parseInt(bearing);

            if(bearing < 0) {
                bearing = 360 + bearing;
            }

            let dBearing = bearing - previousBearing;
            if(Math.abs(dBearing) > 90) {
                // console.log(dBearing);
                let ddBearing = Math.abs(previousDBearing) - Math.abs(dBearing);
                if(Math.abs(ddBearing) > 10) {
                    map.setBearing(bearing);
                }

                previousDBearing = dBearing;
            }

            map.setCenter(coordinates);
            previousBearing = bearing;
        }

        // update marker
        headerMarker.setLngLat(coordinates).addTo(map);

        // draw line
        let timeElement = document.getElementById('time-taken'); 
        let dTime = new Date() - startTime;

        timeElement.innerHTML = "Time Taken: " + convertTOHHMMSS(dTime);
    }
    
}

// convert to hh:mm:ss
function convertTOHHMMSS(time) {
    console.l
    let secs = time / 1000;
    
    secs = secs < 10 ? "0" + secs.toFixed(0) : secs.toFixed(0);
    return "00:00:" + secs;
}