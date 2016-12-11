import angular from 'angular';


export default () => {
    const module = angular.module('waltz.data.types', []);

    module.config(require('./routes'));

    module
        .service('DataTypeStore', require('./services/data-type-store'))
        .service('DataTypeService', require('./services/data-type-service'))
        .service('DataTypeViewDataService', require('./services/data-type-view-data'));

    module
        .component('waltzDataTypeOverview', require('./components/data-type-overview'))
        .component('waltzRatedFlowBoingyGraph', require('./components/rated-flow-boingy-graph'))
        .component('waltzDataTypeTree', require('./components/data-type-tree'))
        .component('waltzDataTypeOriginators', require('./components/data-type-originators'));

    return module.name;
};
