module multipart.module.name {
import Aa = api.Aa;
import Bb = api.Bb;
type STR = string;
type INT = number;
interface NotScope extends SomethingElse {
        intField: number;
    }
interface NotScope2 extends NotScope {
        f1: (x:string)=>boolean;
    }
interface Scope extends ng.IScope {
        showDiv?: string;
        showText: (x:string)=>boolean;
        data: {groups: any[], firstname: string}
        triggerAction: boolean
        user: string;
        maxlength: number;
    }

function ___f($scope: Scope, f__translate:(key: string) => string) {
    const ___x0: boolean = $scope.data.showText['five'].function() === 6;
    const ___x1: boolean = !$scope.user.wantsData();
    const ___x2: boolean = $scope.showDiv;
    const ___x3: any = $scope.triggerAction('six');
    f__translate('CLICK_ME');
    const ___x4: any = $scope.data.firstname;
    const ___x5: any = $scope.maxlength;
    $scope.data.groups.forEach(group => {
        let $index = 0; let $first = true; let $middle=true;
        let $last = true; let $even = true; let $odd = false;
        group.forEach(item => {
            let $index = 0; let $first = true; let $middle=true;
            let $last = true; let $even = true; let $odd = false;
            const ___x6: any = item.name + ' ' + $scope.user.wantsData();
        });
    });
}
}

