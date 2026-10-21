# frozen_string_literal: true

module Studio
  class WorkflowsController < BaseController
    before_action :require_admin
    before_action :load_edit_context, only: [:edit, :update, :permissions, :update_permissions]

    def index
      counts = WorkflowTransition.group(:tracker_id, :role_id).count
      render json: {
        roles: Role.sorted.select(&:consider_workflow?).map { |r| { id: r.id, name: r.name } },
        trackers: Tracker.sorted.map { |t| { id: t.id, name: t.name } },
        workflow_counts: counts.map { |(tracker_id, role_id), count| { tracker_id: tracker_id, role_id: role_id, count: count } }
      }
    end

    def edit
      return render json: { errors: ['请选择跟踪标签与角色'] }, status: :unprocessable_entity unless @trackers && @roles && @statuses.any?

      workflows = WorkflowTransition.where(role_id: @roles.map(&:id), tracker_id: @trackers.map(&:id))
                                    .preload(:old_status, :new_status)
      grouped = {
        always: workflows.select { |w| !w.author && !w.assignee },
        author: workflows.select(&:author),
        assignee: workflows.select(&:assignee)
      }

      render json: {
        statuses: @statuses.map { |s| { id: s.id, name: s.name, is_closed: s.is_closed? } },
        transitions: serialize_transitions(grouped)
      }
    end

    def update
      if @roles && @trackers && params[:transitions]
        transitions = params[:transitions].deep_dup
        transitions.each_value do |by_new|
          by_new.each_value do |by_rule|
            by_rule.reject! { |_rule, val| val == 'no_change' }
          end
        end
        WorkflowTransition.replace_transitions(@trackers, @roles, transitions)
        render json: { ok: true }
      else
        render json: { errors: ['参数不完整'] }, status: :unprocessable_entity
      end
    end

    def permissions
      return render json: { errors: ['请选择跟踪标签与角色'] }, status: :unprocessable_entity unless @roles && @trackers

      fields = (Tracker::CORE_FIELDS_ALL - @trackers.map(&:disabled_core_fields).reduce(:&)).map do |field|
        { field: field, label: l("field_#{field.delete_suffix('_id')}") }
      end
      custom_fields = @trackers.flat_map(&:custom_fields).uniq.sort_by(&:name)
      permissions = WorkflowPermission.rules_by_status_id(@trackers, @roles)
      @statuses.each { |s| permissions[s.id] ||= {} }

      render json: {
        statuses: @statuses.map { |s| { id: s.id, name: s.name } },
        fields: fields,
        custom_fields: custom_fields.map { |cf| { id: cf.id, name: cf.name } },
        permissions: permissions
      }
    end

    def update_permissions
      if @roles && @trackers && params[:permissions]
        permissions = params[:permissions].deep_dup
        permissions.each_value do |by_status|
          by_status.reject! { |_status_id, rule| rule == 'no_change' }
        end
        WorkflowPermission.replace_permissions(@trackers, @roles, permissions)
        render json: { ok: true }
      else
        render json: { errors: ['参数不完整'] }, status: :unprocessable_entity
      end
    end

    private

    def load_edit_context
      @roles = load_roles
      @trackers = load_trackers
      @statuses = load_statuses
    end

    def load_roles
      ids = Array.wrap(params[:role_id])
      roles =
        if ids == ['all']
          Role.sorted.select(&:consider_workflow?)
        elsif ids.present?
          Role.where(id: ids).to_a
        end
      roles.presence
    end

    def load_trackers
      ids = Array.wrap(params[:tracker_id])
      trackers =
        if ids == ['all']
          Tracker.sorted.to_a
        elsif ids.present?
          Tracker.where(id: ids).to_a
        end
      trackers.presence
    end

    def load_statuses
      used_only = params[:used_statuses_only] != '0'
      if @trackers && used_only
        role_ids = Role.all.select(&:consider_workflow?).map(&:id)
        status_ids = WorkflowTransition.where(tracker_id: @trackers.map(&:id), role_id: role_ids)
                                       .where('old_status_id <> new_status_id')
                                       .distinct.pluck(:old_status_id, :new_status_id).flatten.uniq
        IssueStatus.where(id: status_ids).sorted.to_a.presence
      end || IssueStatus.sorted.to_a
    end

    def serialize_transitions(grouped)
      result = {}
      grouped.each do |rule, list|
        result[rule] = list.group_by(&:old_status_id).transform_values do |items|
          items.map { |w| { to: w.new_status_id, author: w.author, assignee: w.assignee } }
        end
      end
      result
    end
  end
end
