define([
  'angular',
  'app',
  'underscore',
  'kbn',
  'moment',
],
function (angular, app, _, kbn, moment) {
  'use strict';

  var module = angular.module('kibana.panels.weeklyreport', []);
  app.useModule(module);

  function stableJSONString(obj) {
    var out;
    if (_.isObject(obj)) {
      var keys = _.keys(obj).sort();
      out = '{';
      _.each(keys, function (k, i) {
        if (i > 0) out += ',';
        out += k + ':' + stableJSONString(obj[k]);
      });
      out += '}';
    } else if (_.isArray(obj)) {
      out = '['
      _.each(obj, function (val, i) {
        if (i > 0) out += ',';
        out += stableJSONString(val);
      });
      out += ']'
    } else if (_.isString(obj)) {
      out = '"' + obj + '"';
    } else if (obj) {
      out = '' + obj;
    }
    return out;
  }

  module.controller('weeklyreport', ['$scope', 'filterSrv', 'dashboard', function ($scope, filterSrv, dashboard) {
    var _d = {
      spyable: true,
      flagMissing: true,
      reportKeys: [
        { key: 'duration:total_str', label: "Time taken - Total Batch" },
        { key: 'duration:premerge_str', label: "MergeAnalytics Complete" },
        { key: 'duration:postmerge_str', label: "POST_Nightly Tasks" },
        { key: 'database:dbaSegments', label: "Database segments (GB)" },
        { key: 'database:dbaDataFiles', label: "Database data files (GB)" },
        { key: 'database:flightLegs', label: "# of Flight Legs per day" },
        { key: 'database:classes', label: "# of Classes" },
        { key: 'database:onlineCities', label: "# of Online Cities" },
        { key: 'OnD Status:daily', label: "OnD 24hr Availability %" },
        { key: 'GRMS Status:daily', label: "GRMS 24hr Availability %" },
        { key: 'OnD Status:customer', label: "OnD Customer Availability %" },
        { key: 'GRMS Status:customer', label: "GRMS Customer Availability %" },
      ],
      organization: 'Avianca Airlines',
      environment: 'PROD',
    };
    _.defaults($scope.panel, _d);

    $scope.panelMeta = {
      modals: [
          {
            description: "Inspect",
            icon: "icon-info-sign",
            partial: "app/partials/inspector.html",
            show: $scope.panel.spyable,
          },
      ],
      status: "Experimental",
      description: "PROS CloudOps weekly report template",
    };

    $scope.init = function () {
      this.getData();
      $scope.$on('refresh', function () { $scope.getData(); });
    };

    $scope.missing = function (value) {
      if (this.panel.flagMissing && _.isUndefined(value)) {
        return { color: 'red' };
      }
      return {};
    };

    $scope.getData = function () {
      $scope.panelMeta.loading = true;
      $scope.dates = [];
      var dateRange = filterSrv.timeRange(true);
      var begin = moment(dateRange.from).startOf('day');
      var end = moment(dateRange.to).subtract({ days: 1 }).endOf('day');
      var di = begin.clone();
      while (di.isBefore(end)) {
        $scope.dates.push(di.clone());
        di.add({ days: 1 });
      }

      var filter = ejs.RangeFilter('timestamp').gte(begin.toISOString()).lte(end.toISOString());

      var request = $scope.ejs.Request()
          .indices(dashboard.indices)
          .size(1000)
          .sort(ejs.Sort('timestamp').desc())
          .query(ejs.FilteredQuery(ejs.MatchAllQuery(), filter).cache(true));

      filter = ejs.OrFilter([
          ejs.TypeFilter('database'),
          ejs.TypeFilter('duration'),
          ejs.AndFilter([
              ejs.TypeFilter('availability2'),
              ejs.QueryFilter(ejs.QueryStringQuery('state:OK')),
          ]).cache(true),
      ]);
      filter = ejs.AndFilter([
          filter,
          ejs.QueryFilter(ejs.QueryStringQuery('source.organization:"' + $scope.panel.organization + '" AND source.environment:"' + $scope.panel.environment + '"')),
      ]);
      request.filter(filter);

      $scope.populate_modal(request);

      request.doSearch().then(function (results) {
        $scope.panelMeta.loading = false;
        $scope.results = results;
        $scope.panel.count = results.hits.total;
        var sources = [];
        var data = _.map(results.hits.hits, function (h) {
          var src = _.clone(h._source);
          src.type = h._type;
          var date = moment(src.timestamp);
          src.date = date.format('YYYY-MM-DD');
          return src;
        });

        var events = _.groupBy(data, 'date');
        var allKeys = {};
        var summary = _.reduce(_.keys(events), function (memo, k) {
          memo[k] = summarizeEvents(events[k]);
          _.extend(allKeys, memo[k]);
          return memo;
        }, {});
        var kl = $scope.panel.keyList = _.keys(allKeys).sort();
        $scope.panel.details = summary;
      });
    };

    function summarizeEvents(events) {
      return _.reduce(events, function (memo, value) {
        switch (value.type) {
          case 'duration':
          case 'database':
            _.each(_.keys(value.fields), function (k) {
              var temp = Math.round(value.fields[k]);
              memo[value.type + ':' + k] = isNaN(temp) ? value.fields[k] : temp;
            });
            break;
          case 'availability2':
            memo[value.service + ':' + value.reportType] = value.percent_str;
            break;
          default:
            console.log("WTF?", value);
        };
        return memo;
      }, {});
    }

    $scope.populate_modal = function (request) {
      $scope.inspector = angular.toJson(JSON.parse(request.toString()), true);
    };

    $scope.set_refresh = function (state) { $scope.refresh = state; };

    $scope.close_edit = function () {
      if ($scope.refresh) {
        $scope.getData();
      }
      $scope.refresh = false;
    };
  }]);

  module.filter('missing', function () {
    return function (input) {
      if (_.isUndefined(input))
        return 'missing';
      else return input;
    };
  });

  module.filter('shortDate', function () {
    return function (input) {
      return moment(input).format('YYYY-MM-DD');
    };
  });
});