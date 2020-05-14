/*
 * Waltz - Enterprise Architecture
 * Copyright (C) 2016, 2017, 2018, 2019 Waltz open source project
 * See README.md for more information
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific
 *
 */

import _ from "lodash";
import {initialiseData} from "../../../common";
import {sameRef} from "../../../common/entity-utils";
import {CORE_API} from "../../../common/services/core-api-utils";
import {entity} from "../../../common/services/enums/entity";
import {getEnumName} from "../../../common/services/enums";
import {sanitizeRelationships} from "../../measurable-relationship-utils";

import template from "./related-measurables-panel.html";
import {displayError} from "../../../common/error-utils";


/**
 * @name waltz-related-measurables-panel
 *
 * @description
 * This component displays entities related to a given measurable.
 * If the user has 'CAPABILITY_EDITOR' role then edit facilities
 * are provided.
 */


const bindings = {
    parentEntityRef: "<"
};


const initialState = {
    categories: [],
    columnDefs: [],
    measurables: [],
    relationships: [],
    selectedCategory: null,
    selectedRow: null,
    gridData: [],
    visibility: {
        editor: false,
        detailMode: "Tree", // table | tree,
        detailModeChanger: false,
        createEditor: false,
        updateEditor: false,
        newRelationshipKind: false
    }
};


const columnDefs = [
    {
        field: "a.name",
        name: "From",
    },
    {
        field: "a.type",
        name: "(From Type)"
    }, {
        field: "relationship",
        name: "Relationship",
        cellFilter: "toDisplayName:'relationshipKind'"
    },
    {
        field: "b.name",
        name: "To"
    }, {
        field: "b.type",
        name: "(To Type)"
    }
];


const DEFAULT_SELECTION_FILTER_FN = () => true;


function mkGridData(selfRef,
                    relationships = [],
                    measurables = [],
                    categories = [],
                    appGroups = [],
                    rowFilterFn = () => true) {

    const measurablesById = _.keyBy(measurables, "id");
    const categoriesById = _.keyBy(categories, "id");
    const appGroupsById = _.keyBy(appGroups, "id");

    const toGenericCell = r => {
        return Object.assign({}, r, { type: getEnumName(entity, r.kind) });
    };

    const toMeasurableCell = r => {
        const c = categoriesById[measurablesById[r.id].categoryId];
        return Object.assign({}, r, { type: c.name });
    };

    const toAppGroupCell = r => {
        const c = appGroupsById[r.id];
        return Object.assign({}, r, { name: c !== null ? c.name : "", type: "App Group" });
    };

    const mkCell = (kind, side) => {
        switch (kind) {
            case "MEASURABLE":
                return toMeasurableCell(side);
            case "APP_GROUP":
                return toAppGroupCell(side);
            default:
                return toGenericCell(side);
        }
    };


    return _
        .chain(relationships)
        .filter(rowFilterFn)
        .map(r => {
            const outbound = sameRef(r.a, selfRef, { skipChecks: true });
            const a = mkCell(r.a.kind, r.a);
            const b = mkCell(r.b.kind, r.b);

            return {
                outbound,
                a,
                b,
                relationship: r.relationship,
            };
        })
        .filter(r => r !== null)
        .sortBy(["a.name", "b.name"])
        .value()
}


function controller($q, $timeout, serviceBroker, notification) {
    const vm = this;

    const calcGridData = () => {
        return mkGridData(
            vm.parentEntityRef,
            vm.relationships,
            vm.measurables,
            vm.categories,
            vm.appGroups,
            vm.selectionFilterFn);
    };


    // -- INTERACT --

    vm.onChangeDetailMode = (mode) => {
        vm.visibility.detailMode = mode;
    };

    vm.refresh = ()=> {
        loadAll()
            .then(() => {
                if (vm.selectedRow) {
                    vm.selectedRow = _.find(vm.gridData || [], row => {
                        const sameSource = sameRef(vm.selectedRow.a, row.a, { skipChecks: true });
                        const sameTarget = sameRef(vm.selectedRow.b, row.b, { skipChecks: true });
                        const sameRelKind = vm.selectedRow.relationship.relationship === row.relationship.relationship;
                        return sameSource && sameTarget && sameRelKind;
                    });
                }
            });
    };

    vm.selectCategory = (c) => $timeout(() => {
        vm.selectedCategory = c;
        if (_.get(c, "ref.kind") === "MEASURABLE_CATEGORY") {
            vm.visibility.detailModeChanger = true;
        } else {
            vm.visibility.detailMode = "table";
            vm.visibility.detailModeChanger = false;
        }
        vm.selectedRow = null;
        vm.selectionFilterFn = c.relationshipFilter;
        vm.gridData = calcGridData();
        loadAllowedRelationshipKinds();
        vm.cancelEditor();
    });

    vm.clearCategory = () => $timeout(() => {
        vm.selectedCategory = null;
        vm.selectedRow = null;
        vm.selectionFilterFn = DEFAULT_SELECTION_FILTER_FN;
        vm.gridData = calcGridData();
        vm.visibility.detailMode = "table";
        vm.visibility.detailModeChanger = false;
    });

    vm.selectRow = (r) => {
        if (r === vm.selectedRow) {
            vm.clearRowSelection(); // toggle
        } else {
            vm.filteredGridData = _.filter(vm.gridData, d => d.a.id === r.a.id && d.b.id === r.b.id);
            vm.selectedRow = r;
        }
        vm.cancelEditor();
    };

    vm.clearRowSelection = () => {
        vm.selectedRow = null;
    };

    vm.selectRelationship = (r) => {
        if (r === vm.selectedRelationship) {
            vm.selectedRelationship = null; // toggle
        } else {
            vm.selectedRelationship = r;
        }
        vm.cancelEditor();
    };

    vm.removeRelationship = (rel) => {
        if (confirm("Are you sure you want to delete this relationship ?")) {
            vm.onRemove(rel)
                .then(() => {
                    notification.warning("Relationship removed");
                    vm.clearRowSelection();
                    loadRelationships();
                })
                .catch(e => {
                    displayError(notification, "Relationship could not be removed", e)
                });
        }
    };

    vm.beginNewRelationship = () => {
        vm.visibility.editor = true;
        vm.visibility.createEditor = true;
        vm.visibility.updateEditor = false;
    };

    vm.cancelEditor = () => {
        vm.visibility.editor = false;
        vm.visibility.createEditor = false;
        vm.visibility.updateEditor = false;
    };

    vm.updateExistingRelationship = () => {
        vm.visibility.editor = true;
        vm.visibility.createEditor = false;
        vm.visibility.updateEditor = true;
    };

    vm.selectionFilterFn = DEFAULT_SELECTION_FILTER_FN;


    // -- API --

    const loadRelationships = () => {
        return serviceBroker
            .loadViewData(
                CORE_API.MeasurableRelationshipStore.findByEntityReference,
                [ vm.parentEntityRef ],
                { force: true })
            .then(r => {
                vm.relationships = sanitizeRelationships(r.data, vm.measurables, vm.categories);
                vm.gridData = calcGridData();
            });
    };

    const loadAllowedRelationshipKinds = () => {

        const parentRef = (_.get(vm.parentEntityRef, 'kind') === 'MEASURABLE')
            ? { id: _.find(vm.measurables, m => m.id === vm.parentEntityRef.id).categoryId,
                kind: 'MEASURABLE_CATEGORY'}
            : vm.parentEntityRef;

        return serviceBroker.loadViewData(
            CORE_API.RelationshipKindStore.findRelationshipKindsBetweenEntities,
            [parentRef, vm.selectedCategory.ref])
            .then(r => vm.relationshipKinds = r.data)
    };

    const loadAll = () => {
        const promises = [
            serviceBroker.loadAppData(CORE_API.MeasurableCategoryStore.findAll).then(r => r.data),
            serviceBroker.loadAppData(CORE_API.MeasurableStore.findAll).then(r => r.data),
            serviceBroker.loadAppData(CORE_API.AppGroupStore.findPublicGroups).then(r => r.data),
            serviceBroker.loadAppData(CORE_API.AppGroupStore.findPrivateGroups).then(r => r.data)
        ];
        return $q
            .all(promises)
            .then(([categories, measurables, publicAppGroups, privateAppGroups]) => {
                vm.categories = categories;
                vm.measurables = measurables;
                vm.appGroups = _.union(publicAppGroups, privateAppGroups);
            })
            .then(loadRelationships)

    };

    vm.onRemove = (rel) => {
        return serviceBroker
            .execute(CORE_API.MeasurableRelationshipStore.remove, [rel])
    };


    // -- BOOT --
    vm.$onInit = () => {
        initialiseData(vm, initialState);
        vm.columnDefs = columnDefs;
        loadAll();
    };
}


controller.$inject = [
    "$q",
    "$timeout",
    "ServiceBroker",
    "Notification"
];


const component = {
    template,
    bindings,
    controller
};


export default component;
