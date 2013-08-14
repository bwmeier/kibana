'use strict';

angular.module('kibana.durations', [])
.controller('durations', ['$scope', '$filter', 'querySrv', 'dashboard', 'filterSrv',
function ($scope, $filter, querySrv, dashboard, filterSrv) {
    $scope.panelMeta = {
        status: "Experimental",
        description: "Experimental durations panel"
    };

    // Set and populate defaults
    var _d = {
        queries: {
            mode: 'all',
            ids: []
        },
        status: "Experimental",
        order: "count",
        style: {},
        spyable: true,
        key_field: "taskname",
        value_field: "duration",
        chart: "bar",
        labels: false,
        numTerms: 10,
    };
    _.defaults($scope.panel, _d);

    $scope.init = function () {
        $scope.$on('refresh', function () {
            if (!$scope.myRefresh) {
                $scope.get_data();
            }
            $scope.myRefresh = false;
            $scope.$emit('render');
        });

        $scope.get_data();
    };

    $scope.get_data = function () {
        delete $scope.panel.error;

        var identity = function (value) { return value; };
        var durationToString = $filter('duration');

        // Make sure we have everything for the request to complete
        if (dashboard.indices.length === 0) {
            return;
        }

        $scope.panelMeta.loading = true;
        var order = $scope.panel.order;
        var request = $scope.ejs.Request().indices(dashboard.indices);
        var facet = $scope.ejs.TermStatsFacet('stats')
          .keyField($scope.panel.key_field).valueField($scope.panel.value_field)
          .order(order)
          .facetFilter(filterSrv.getBoolFilter(filterSrv.ids));
        if (!_.isUndefined($scope.panel.numTerms)) {
            facet.size($scope.panel.numTerms);
        }
        $scope.transform = (order == 'count') ? identity : durationToString;

        request = request.facet(facet).size(0);

        $scope.inspector = angular.toJson(JSON.parse(request.toString()), true);

        request.doSearch().then(function (results) {
            $scope.panelMeta.loading = false;
            var terms = results.facets.stats.terms;
            var current = _.union(querySrv.idsByMode('all'));
            var existing = [];
            var ids = $scope.panel.queries.ids = [];
            _.each(terms, function (t) {
                var qString = $scope.panel.key_field + ':"' + t.term + '"';
                var query = querySrv.findQuery(qString);
                if (!query) {
                    ids.push(querySrv.set({
                        query: qString,
                        alias: t.term,
                    }));
                } else {
                    existing.push(query.id);
                    ids.push(query.id);
                }
            });
            _.each(_.difference(current, existing), function (id) {
                querySrv.remove(id);
            });
            
            var k = 0;
            $scope.data = _.map(terms, function (value) {
                var data = {
                    label: value.term,
                    data: [[k, value[order]]],
                    color: querySrv.colors[ids[k] % querySrv.colors.length],
                    actions: true,
                    value: value,
                };
                k++;
                return data;
            });
            $scope.myRefresh = true;
            dashboard.refresh();
        });
    };
}])
.filter('zeropad', function () {
    return function (value, digits) {
        var result = value + "";
        while (result.length < digits) {
            result = "0" + result;
        }
        return result;
    }
})
.filter('duration', ['$filter', function ($filter) {
    var zeropad = $filter('zeropad');    
    return function (value) {
        var t = Math.round(value);
        var s = "";
        // milliseconds
        var r = t % 1000;
        t = (t - r) / 1000;
        s = zeropad(r, 3);
        // seconds
        r = t % 60;
        t = (t - r) / 60;
        s = zeropad(r, 2) + "." + s;
        // hours + minutes
        r = t % 60;
        t = (t - r) / 60;
        s = t + ":" + zeropad(r, 2) + ":" + s;
        return s;
    }
}]).directive('termsChart', ['querySrv', 'filterSrv', 'dashboard', function (querySrv, filterSrv, dashboard) {
    return {
        restrict: 'A',
        link: function (scope, elem, attrs, ctrl) {

            // Receive render events
            scope.$on('render', function () {
                render_panel();
            });

            // Re-render if the window is resized
            angular.element(window).bind('resize', function () {
                render_panel();
            });

            // Function for rendering panel
            function render_panel() {
                var plot, chartData;
                var scripts = $LAB.script("common/lib/panels/jquery.flot.js").wait()
                                  .script("common/lib/panels/jquery.flot.pie.js");

                // IE doesn't work without this
                elem.css({ height: scope.panel.height || scope.row.height });

                // Make a clone we can operate on.
                chartData = _.clone(scope.data);
                chartData = scope.panel.missing ? chartData :
                  _.without(chartData, _.findWhere(chartData, { meta: 'missing' }));
                chartData = scope.panel.other ? chartData :
                _.without(chartData, _.findWhere(chartData, { meta: 'other' }));

                var colorMap = _.map(scope.panel.queries.ids, function (id) {
                    return querySrv.colors[id % querySrv.colors.length];
                });

                // Populate element.
                scripts.wait(function () {
                    // Populate element
                    try {
                        // Add plot to scope so we can build out own legend 
                        if (scope.panel.chart === 'bar') {
                            plot = $.plot(elem, chartData, {
                                legend: { show: false },
                                series: {
                                    lines: { show: false, },
                                    bars: { show: true, fill: 1, barWidth: 0.8, horizontal: false },
                                    shadowSize: 1
                                },
                                yaxis: { show: true, min: 0, color: "#c8c8c8" },
                                xaxis: { show: false },
                                grid: {
                                    borderWidth: 0,
                                    borderColor: '#eee',
                                    color: "#eee",
                                    hoverable: true,
                                    clickable: true
                                },
                                colors: colorMap
                            });
                        }
                        if (scope.panel.chart === 'pie') {
                            var labelFormat = function (label, series) {
                                return '<div ng-click="build_search(panel.field,\'' + label + '\')' +
                                  ' "style="font-size:8pt;text-align:center;padding:2px;color:white;">' +
                                  label + '<br/>' + Math.round(series.percent) + '%</div>';
                            };

                            plot = $.plot(elem, chartData, {
                                legend: { show: false },
                                series: {
                                    pie: {
                                        innerRadius: scope.panel.donut ? 0.4 : 0,
                                        tilt: scope.panel.tilt ? 0.45 : 1,
                                        radius: 1,
                                        show: true,
                                        combine: {
                                            color: '#999',
                                            label: 'The Rest'
                                        },
                                        stroke: {
                                            width: 0
                                        },
                                        label: {
                                            show: scope.panel.labels,
                                            radius: 2 / 3,
                                            formatter: labelFormat,
                                            threshold: 0.1
                                        }
                                    }
                                },
                                //grid: { hoverable: true, clickable: true },
                                grid: { hoverable: true, clickable: true },
                                colors: colorMap
                            });
                        }

                        // Populate legend
                        if (elem.is(":visible")) {
                            scripts.wait(function () {
                                scope.legend = plot.getData();
                                if (!scope.$$phase) {
                                    scope.$apply();
                                }
                            });
                        }

                    } catch (e) {
                        elem.text(e);
                    }
                });
            }

            function tt(x, y, contents) {
                var tooltip = $('#pie-tooltip').length ?
                  $('#pie-tooltip') : $('<div id="pie-tooltip"></div>');
                //var tooltip = $('#pie-tooltip')
                tooltip.html(contents).css({
                    position: 'absolute',
                    top: y + 5,
                    left: x + 5,
                    color: "#c8c8c8",
                    padding: '10px',
                    'font-size': '11pt',
                    'font-weight': 200,
                    'background-color': '#1f1f1f',
                    'border-radius': '5px',
                }).appendTo("body");
            }

            elem.bind("plotclick", function (event, pos, object) {
                if (object) {
                    scope.build_search(scope.data[object.seriesIndex]);
                }
            });

            elem.bind("plothover", function (event, pos, item) {
                if (item) {
                    var value = scope.panel.chart === 'bar' ?
                      item.datapoint[1] : item.datapoint[1][0][1];
                    tt(pos.pageX, pos.pageY,
                      "<div style='vertical-align:middle;border-radius:10px;display:inline-block;background:" +
                      item.series.color + ";height:20px;width:20px'></div> " + item.series.label +
                      " (" + scope.transform(value) + ")");
                } else {
                    $("#pie-tooltip").remove();
                }
            });

        }
    };
}]);
