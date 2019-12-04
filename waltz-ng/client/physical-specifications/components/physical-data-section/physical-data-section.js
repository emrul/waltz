/*
 * Waltz - Enterprise Architecture
 * Copyright (C) 2016, 2017, 2018, 2019 Waltz open source project
 * See README.md for more information
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

import _ from "lodash";
import {initialiseData} from "../../../common";
import template from "./physical-data-section.html";
import {isRemoved} from "../../../common/entity-utils";
import {columnDef, withWidth} from "../../../physical-flow/physical-flow-table-utilities";


const bindings = {
    primaryRef: "<",
    physicalFlows: "<",
    specifications: "<",
    logicalFlows: "<",
    onInitialise: "<?"
};


const initialState = {
    header: "All Flows",
    primaryRef: null,  // entityReference
    physicalFlows: [],
    logicalFlows: [],
    specifications: [],
    selectedFilter: "ALL",
    // onInitialise: (e) => {}
};


/**
 * Given an enriched flow returns a boolean indicating
 * if any enriched fields are missing
 * @param f
 */
const isIncomplete = f => !f.logicalFlow ||  !f.specification;

/**
 * Takes a entityReference and returns a new function which takes an
 * enriched flow and returns true if the entity is producing the flow
 * or false if not
 * @param entityRef
 * @private
 */
const _isProducer = (entityRef) => (f) => {
    const source = f.logicalFlow.source;
    return source.id === entityRef.id && source.kind === entityRef.kind;
};


/**
 * Takes a entityReference and returns a new function which takes an
 * enriched flow and returns true if the entity is consuming the flow
 * or false if not
 * @param entityRef
 * @private
 */
const _isConsumer = (entityRef) => (f) => {
    const target = f.logicalFlow.target;
    return target.id === entityRef.id && target.kind === entityRef.kind;
};

const _allFlows = (entityRef) => (f) => true;

function mkData(primaryRef,
                specifications = { produces: [], consumes: [] },
                physicalFlows = [],
                logicalFlows = [],
                filter = _allFlows)
{
    if (!primaryRef) return [];

    const specsById = _.keyBy(specifications, "id");
    const logicalById = _.keyBy(logicalFlows, "id");

    const enrichFlow = (pf) => {
        return {
            physicalFlow: Object.assign({}, pf, {name: _.get(specsById[pf.specificationId], 'name')}),
            logicalFlow: logicalById[pf.logicalFlowId],
            specification: specsById[pf.specificationId]
        };
    };

    const filteredFlows = _
        .chain(physicalFlows)
        .reject(isRemoved)
        .map(enrichFlow)
        .reject(isIncomplete)
        .filter(filter(primaryRef))
        .value();

    return { filteredFlows };
}


function controller() {

    const vm = initialiseData(this, initialState);

    vm.columnDefs = [
        withWidth(columnDef.name, "25%"),
        withWidth(columnDef.extId, "5%"),
        columnDef.source,
        columnDef.target,
        columnDef.observation,
        columnDef.criticality,
        columnDef.description
    ];

    vm.unusedSpecificationsColumnDefs = [
        { field: "name", displayName: "Name" },
        { field: "format", displayName: "Format", cellFilter: "toDisplayName:\"dataFormatKind\"" },
        { field: "description", displayName: "Description" }
    ];

    vm.$onChanges = () => {
        Object.assign(vm, mkData(vm.primaryRef, vm.specifications, vm.physicalFlows, vm.logicalFlows, _allFlows));
    };

    vm.changeFilter = (str) => {
        switch (str) {
            case "ALL":
                Object.assign(vm, mkData(vm.primaryRef, vm.specifications, vm.physicalFlows, vm.logicalFlows, _allFlows));
                vm.header = "All Flows";
                break;
            case "PRODUCES":
                Object.assign(vm, mkData(vm.primaryRef, vm.specifications, vm.physicalFlows, vm.logicalFlows, _isProducer));
                vm.header = "Produces";
                break;
            case "CONSUMES":
                Object.assign(vm, mkData(vm.primaryRef, vm.specifications, vm.physicalFlows, vm.logicalFlows, _isConsumer));
                vm.header = "Consumes";
                break;
        }
    }
}

controller.$inject = ["$scope"];


const component = {
    template,
    bindings,
    controller
};


export default component;