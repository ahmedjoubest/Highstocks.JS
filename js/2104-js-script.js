
Highcharts.setOptions({
    chart: {
        style: {
            fontFamily: 'poppins'
        }
    }
});

$('[data-toggle=tooltip]').tooltip();
let csv_data;
Array.prototype.remove = function () {
    let what, a = arguments, L = a.length, ax;

    while (L && this.length) {
        what = a[--L];
        while ((ax = this.indexOf(what)) !== -1) {
            this.splice(ax, 1);
        }
    }

    return this;
};

let currencyFormatter = new Intl.NumberFormat('en-US');

let configSet = function (key, obj) {
    localStorage.setItem(key, JSON.stringify(obj));
}

let configGet = function (key) {
    return JSON.parse(localStorage.getItem(key));
}

let loadIncludeMetricNames = function () {
    window.include_metric_names = {};

    try {
        let item = configGet('include_metric_names');
        if (item)
            window.include_metric_names = item;
    } catch (e) {
    }

    for (const [key, value] of Object.entries(window.include_metric_names)) {
        let el = $(`[data-include-index-name="${key}"]`);
        if (el.length === 0)
            delete window.include_metric_names[key];
        else if (value === false)
            $(el).trigger('click');
    }
}

let saveIncludeMetricNames = function () {
    try {
        configSet('include_metric_names', window.include_metric_names);
    } catch (e) {
    }
}

let is_loading = true;
let refresh_chart = true;

$('.copy-link').on('click', function (e) {
    e.preventDefault();

    let copyValue = window.location.href;

    navigator.clipboard.writeText(copyValue).then(function () {
        // empty
    }, function () {
        prompt("Copy to clipboard: Ctrl+C, Enter", copyValue);
    });
});

$('.copy-address').on('click', function (e) {
    e.preventDefault();

    let copyValue = $(this).parent().find('.address').text();

    navigator.clipboard.writeText(copyValue).then(function () {
        // empty
    }, function () {
        prompt("Copy to clipboard: Ctrl+C, Enter", copyValue);
    });

    $(this).addClass('copied');
});

$('.toggle-all').on('click', function (e) {
    if (is_loading)
        return;

    let new_state_enabled = Object.values(window.include_metric_names).indexOf(false) > -1;

    refresh_chart = false;

    $.each($('[data-include-index-name]'), function (_, el) {
        let state = $(this).is(':checked');
        if (state !== new_state_enabled)
            $(el).trigger('click');
    });

    refresh_chart = true;
    updateChart();
});

$('[data-include-index-name]').on('click', function (e) {
    if (this.checked)
        $(this).parents('.metric').removeClass('unchecked');
    else
        $(this).parents('.metric').addClass('unchecked');

    if (is_loading)
        return;

    let metric_name = $(this).data('include-index-name');

    window.include_metric_names[metric_name] = $(this).is(':checked');
    saveIncludeMetricNames();
    updateChart();
});

let formatPrice = function (price) {
    return '$' + currencyFormatter.format(Math.ceil(price));
}

function hex(c) {
    let s = "0123456789abcdef";
    let i = parseInt(c);
    if (i === 0 || isNaN(c))
        return "00";
    i = Math.round(Math.min(Math.max(0, i), 255));
    return s.charAt((i - i % 16) / 16) + s.charAt(i % 16);
}

function convertToHex(rgb) {
    return '#' + hex(rgb[0]) + hex(rgb[1]) + hex(rgb[2]);
}

function trim(s) {
    return (s.charAt(0) === '#') ? s.substring(1, 7) : s
}

function convertToRGB(hex) {
    let color = [];
    color[0] = parseInt((trim(hex)).substring(0, 2), 16);
    color[1] = parseInt((trim(hex)).substring(2, 4), 16);
    color[2] = parseInt((trim(hex)).substring(4, 6), 16);
    return color;
}

function generateColor(startColor, endColor, size) {
    startColor = convertToRGB(startColor);
    endColor = convertToRGB(endColor);

    let result = [];

    for (let i = 0; i < size; i++) {
        let endProgress = i / (size - 1);
        let startProgress = 1 - endProgress;

        let c = [];
        c[0] = startColor[0] * startProgress + endColor[0] * endProgress;
        c[1] = startColor[1] * startProgress + endColor[1] * endProgress;
        c[2] = startColor[2] * startProgress + endColor[2] * endProgress;

        result.push(convertToHex(c));
    }

    return result;

}

let colorize_table = undefined;

function buildColorizeTable() {
    colorize_table = generateColor('#0e7904', '#e4e30a ', 50)
        .concat(generateColor('#e4e30a', '#ae0806', 50))
        //.concat(generateColor('#FFE000', '#BB3000', 32))
        //.concat(generateColor('#BB3000', '#200000', 11));
}

let colorize = function (data, colorData) {
    return data.map(function(val, i) {
        let colorize_table_index = Math.max(Math.min(colorData[i][1], 100), 0);

        return {
            x: val[0],
            y: val[1],
            color: colorize_table[colorize_table_index],
        };
    });
}

let initChart = function (data) {
    if ($('#chart').length === 0)
        return;

    window.data = data;
    window.dates = Object.keys(window.data['Price']);
    window.x_min = window.dates[0];
    window.x_max = window.dates[window.dates.length - 1];

    buildColorizeTable();
    loadIncludeMetricNames();
    updateIndexControls();
    renderChart();
    updateChart();
}

let updateIndexControls = function () {
    $('[data-index-name]').each(function () {
        let index_name = $(this).data('index-name');
        if (index_name in window.data) {
            let index_value = Math.ceil(Object.values(window.data[index_name]).slice(-1)[0] * 100);
            $(this).text(index_value.toString());
        }
    });

    let lastUpdateTimestamp = moment.unix(
        parseInt(Object.keys(window.data['Price']).slice(-1)[0])
    ).utc().format('MMMM Do, YYYY')

    $('[data-timestamp]').text(lastUpdateTimestamp);
}

let updateChart = async function () {
    if (refresh_chart === false)
        return;

    let metrics_disabled = false;
    let metric_names = Object.keys(window.data);
    metric_names.remove('Price');
    metric_names.remove('Confidence');

    for (let [key, value] of Object.entries(window.include_metric_names))
        if (metric_names.includes(key) && value === false) {
            metric_names.remove(key);
            metrics_disabled = true;
        }
    
    let data_cbbi = csv_data.map(d=>[d.date,d.moon_index]);

    let data_bitcoin = csv_data.map(d=>[d.date,d.price]);
    window.chart.series[0].update({
        data: colorize(data_bitcoin, data_cbbi)
    }, true);

    window.chart.series[1].update({
        data: data_cbbi
    }, true);

    $('.confidence-score-value').text(data_cbbi[data_cbbi.length - 1][1].toString());

    if (metrics_disabled)
        $('.metrics-disabled-alert').removeClass('d-none')
    else
        $('.metrics-disabled-alert').addClass('d-none')
}

let markerRadius = 1.8;
let markerScale = 1.0;
let markerScaleFactor = 0.55;

let renderChart = function () {
    console.log("Rendering chart");
    Highcharts.setOptions({
        lang: {
            thousandsSep: ','
        },

        plotOptions: {
            series: {
                animation: false
            }
        }
    });

    window.chart = Highcharts.stockChart('chart', {
        chart: {
            marginRight: 80,
        },

        title: {
            text: 'Bitcoin Historical Chart'
        },

        subtitle: {
            text: 'Moonindex'
        },

        legend: {
            enabled: true
        },

        tooltip: {
            hideDelay: 300,
            xDateFormat: '%A, %b %d, %Y'
        },

        credits: {
            enabled: false,
        },

        rangeSelector: {
            buttons: [{
                type: 'month',
                count: 6,
                text: '6M',
                title: 'View 6 months',
            }, {
                type: 'year',
                count: 1,
                text: '1Y',
                title: 'View 1 year'
            }, {
                type: 'year',
                count: 3,
                text: '3Y',
                title: 'View 3 years'
            }, {
                type: 'year',
                count: 6,
                text: '6Y',
                title: 'View 6 years'
            }, {
                type: 'all',
                text: 'ALL',
                title: 'View all'
            }]
        },

        yAxis: [{
            type: 'logarithmic',
            opposite: true,

            gridLineColor: '#00000000',
            tickPixelInterval: 32,

            labels: {
                style: {
                    color: '#dd8861',
                },

                align: 'left',
                x: 15,
            },
        }, {
            type: 'linear',
            opposite: false,
            max: 100,
            min: 0,

            gridLineColor: '#00000010',
            tickPixelInterval: 40,
            endOnTick: false,

            labels: {
                style: {
                    color: '#2f4c6c',
                },

                align: 'right',
                x: -15,
            },
        }, {
            type: 'linear',
            min: 0,
            visible: false,
        }, {
            type: 'linear',
            min: 0,
            visible: false,
        }, {
            type: 'linear',
            min: 0,
            visible: false,
        }],

        series: [{
            type: 'spline',
            name: 'Bitcoin Price',
            data: [],
            yAxis: 0,

            dataGrouping: {
                enabled: false
            },

            marker: {
                enabled: true,
                lineColor: undefined,
                radius: markerRadius,
            },

            color: '#dd8861',
            lineWidth: 0.6,
            findNearestPointBy: 'xy',
            showInNavigator: false,
            turboThreshold: 0,

            tooltip: {
                valueDecimals: 2,
                valuePrefix: '$',
            },

            states: {
                hover: {
                    lineWidthPlus: 0,
                },
            },
        }, {
            type: 'areaspline',
            name: 'Moonindex',
            data: [],
            yAxis: 1,

            dataGrouping: {
                enabled: false
            },

            fillColor: {
                linearGradient: {
                    x1: 0,
                    y1: 0,
                    x2: 0,
                    y2: 1
                },
                stops: [
                    [0, '#2f4c6c36'],
                    [1, '#2f4c6c00']
                ]
            },

            color: '#2f4c6c',
            lineWidth: 1,
            findNearestPointBy: 'xy',
            showInNavigator: true,

            tooltip: {
                valueDecimals: 0,
            },

            states: {
                hover: {
                    lineWidthPlus: 0,
                },
            },
        }],
    });
}


let initTable = function (json) {}

let completeLoading = function () {
    $('#loading').remove();
    is_loading = false;
}

fetch('https://colintalkscrypto.com/cbbi/data/latest.json', {
    referrerPolicy: 'no-referrer',
})
    .then(response => {
        if (!response.ok)
            throw new Error(response.status);

        return response.json();
    })
    .then(async (json) => {
        const csv_request = await fetch('https://sroc.fitsbachinteractive.workers.dev?https://docs.google.com/spreadsheets/d/e/2PACX-1vSUw1YrHfmOwZAVM_2v2oRhlAiLl5xSFUSbEs-83MpofST-w78QbWvneM_X1kw9Vo7XYMAx85srD26y/pub?gid=137640072&single=true&output=csv',{
            headers:{
                'Origin':'google.com'
            }
        });
        let csv_response = (await csv_request.text()).split('\r\n');
        let csv_headers = csv_response.shift();
        csv_data = csv_response.map(s=>{
            let [long_date, year, price, moon_index, risk] = s.split(',');
            return {
                date:new Date(`${long_date}, ${year}`).getTime(),
                price: parseInt(price),
                moon_index: parseInt(moon_index),
                risk: parseFloat(risk)
            }
        }).reverse();
        initChart(json);
        initTable(json);
        completeLoading();
    })
    .catch(error => {
        alert(`An error has occurred during CBBI data load :(\nPlease try again later by reloading the page.\n\n${error}`);

        setTimeout(function () {
            window.location.reload();
        }, 5_000);

        throw(error);
    });
