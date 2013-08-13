'use strict';

angular.module('kibana.durations', [])
.controller('durations', ['$scope', '$filter', 'querySrv', 'dashboard', 'filterSrv', 
function($scope, $filter, querySrv, dashboard, filterSrv) {
  $scope.panelMeta = {
    status  : "Experimental",
    description : "Experimental durations panel"
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
  };
  _.defaults($scope.panel,_d);

  $scope.init = function() {
    $scope.$on('refresh',function(){
      $scope.get_data();
    });

    $scope.get_data();
  };
  
  $scope.get_data = function(segment, query_id) {
    delete $scope.panel.error;

    // Make sure we have everything for the request to complete
    if(dashboard.indices.length === 0) {
      return;
    }
    var _range = $scope.range = filterSrv.timeRange('min');
    
    if ($scope.panel.auto_int) {
      $scope.panel.interval = kbn.secondsToHms(
        kbn.calculate_interval(_range.from,_range.to,$scope.panel.resolution,0)/1000);
    }

    $scope.panelMeta.loading = true;
    var _segment = _.isUndefined(segment) ? 0 : segment;
    var request = $scope.ejs.Request().indices(dashboard.indices[_segment]);
    var facet = $scope.ejs.TermStatsFacet('stats')
      .keyField($scope.panel.key_field).valueField($scope.panel.value_field)
      .order($scope.panel.order)
      .facetFilter(filterSrv.getBoolFilter(filterSrv.ids));

    request = request.facet(facet).size(0);
    $scope.inspector = angular.toJson(JSON.parse(request.toString()),true);

    request.doSearch().then(function(results){
      var identity = function (value) { return value; };
      var durationToString = $filter('duration');
      var transform = ($scope.panel.order == 'count') ? identity : durationToString;

      $scope.panelMeta.loading = false;
      $scope.results = results.facets.stats.terms;
      $scope.data = _.map($scope.results, function(value) {
        return {
          term: value.term,
          value: transform(value[$scope.panel.order]),
        };
      });
    });
  };
}])
.filter('zeropad', function() {
  return function (value, digits) {
  	var result = value + "";
	  while (result.length < digits) {
		  result = "0" + result;
  	}
	  return result;
  }
})
.filter('duration', function($filter) {
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
});
