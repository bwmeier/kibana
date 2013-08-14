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
  
  $scope.get_data = function() {
    delete $scope.panel.error;

    var identity = function (value) { return value; };
    var durationToString = $filter('duration');

    // Make sure we have everything for the request to complete
    if(dashboard.indices.length === 0) {
      return;
    }

    $scope.panelMeta.loading = true;
    var order = $scope.panel.order;
    var request = $scope.ejs.Request().indices(dashboard.indices);
    var facet = $scope.ejs.TermStatsFacet('stats')
      .keyField($scope.panel.key_field).valueField($scope.panel.value_field)
      .order(order)
      .facetFilter(filterSrv.getBoolFilter(filterSrv.ids));
    var transform = (order == 'count') ? identity : durationToString;

    request = request.facet(facet).size(0);

    $scope.inspector = angular.toJson(JSON.parse(request.toString()),true);

    request.doSearch().then(function(results){
      $scope.panelMeta.loading = false;
      var terms = results.facets.stats.terms;
      $scope.data = _.map(terms, function(value) {
        return {
          term: value.term,
          textvalue: transform(value[order]),
          value: value[order],
        };
      });
      var current = querySrv.idsByMode('all');
      var existing = [];
      _.each(terms, function(t){
        var qString = $scope.panel.key_field + ':"' + t.term + '"';
        var query = querySrv.findQuery(qString);
        if (!query) {
          querySrv.set({
            query: qString,
            alias: t.term,
          });
        } else {
          existing.push(query.id);
        }
      });
      _.each(_.difference(current, existing), function(id) {
        querySrv.remove(id);
      });
      $scope.panel.queries.ids = querySrv.idsByMode('all');
      dashboard.refresh();
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
