# frozen_string_literal: true

module Studio
  class KanbanBoardsController < BaseController
    PAGE_SIZE = 30

    before_action :require_studio_login

    def index
      boards = owned.order(:id)
      boards.each { |board| ensure_one_status_per_column!(board) }
      render json: { boards: boards.map { |board| payload(board.reload) } }
    end

    def create
      name = params[:name].to_s.strip
      if name.blank?
        render json: { errors: ['请填写看板名称'] }, status: :unprocessable_entity
        return
      end
      if IssueStatus.none?
        render json: { errors: ['还没有工单状态，无法建立看板'] }, status: :unprocessable_entity
        return
      end
      board = KanbanBoard.create_with_defaults!(User.current, name)
      render json: { board: payload(board) }, status: :created
    end

    def update
      board = find_board
      return unless board

      errors = apply_update(board)
      if errors.any?
        render json: { errors: errors }, status: :unprocessable_entity
        return
      end
      render json: { board: payload(board.reload) }
    end

    def destroy
      board = find_board
      return unless board

      board.destroy
      render json: { ok: true }
    end

    def issues
      board = find_board
      return unless board

      ensure_one_status_per_column!(board)
      scope = filtered_issues(active_filters(board))
      columns = board.kanban_columns.order(:position)
      offset = params[:offset].to_i
      if params[:column_id].present?
        columns = columns.where(id: params[:column_id])
        if columns.none?
          render json: { errors: ['列不存在'] }, status: :not_found
          return
        end
      else
        offset = 0
      end
      covered = board.kanban_columns.flat_map(&:status_ids)
      uncovered = covered.any? ? scope.where.not(status_id: covered).count : scope.count
      render json: {
        uncovered: uncovered,
        columns: columns.map { |column| column_issues(column, scope, offset) }
      }
    end

    private

    def owned
      KanbanBoard.where(user_id: User.current.id)
    end

    def find_board
      board = owned.find_by(id: params[:id])
      render json: { errors: ['看板不存在'] }, status: :not_found unless board
      board
    end

    def apply_update(board)
      errors = []
      if params.key?(:name)
        name = params[:name].to_s.strip
        errors << '请填写看板名称' if name.blank?
        board.name = name if name.present?
      end
      if params.key?(:group_by)
        group_by = params[:group_by].to_s
        if KanbanBoard::GROUP_BY.include?(group_by)
          board.group_by = group_by
        else
          errors << '分组方式无效'
        end
      end
      assign_filters(board) if params.key?(:filters)
      return errors if errors.any?
      return board.errors.full_messages unless board.save
      return replace_columns(board) if params.key?(:columns)

      []
    end

    def assign_filters(board)
      raw = params[:filters]
      raw = raw.to_unsafe_h if raw.respond_to?(:to_unsafe_h)
      board.filters = raw
    end

    def replace_columns(board)
      rows = Array(params[:columns])
      return ['至少保留一列'] if rows.empty?

      statuses = IssueStatus.all.index_by(&:id)
      seen = []
      built = []
      rows.each_with_index do |row, index|
        row = row.to_unsafe_h if row.respond_to?(:to_unsafe_h)
        ids = Array(row['status_ids'] || row[:status_ids]).map(&:to_i).uniq.select { |id| statuses.key?(id) }
        return ["第 #{index + 1} 列只能对应一个状态"] if ids.length != 1
        overlap = ids & seen
        return ['同一个状态只能出现在一列'] if overlap.any?

        seen.concat(ids)
        target = ids.first
        name = statuses[target].name
        section_name = (row['section_name'] || row[:section_name]).to_s.strip
        return ['一级标题不能超过 60 个字'] if section_name.length > 60

        built << { name: name, position: index + 1, status_ids: [target], target_status_id: target, section_name: section_name.presence }
    end

    KanbanColumn.transaction do
      board.kanban_columns.destroy_all
      built.each { |attrs| board.kanban_columns.create!(attrs) }
    end
    []
  end

    def ensure_one_status_per_column!(board)
      columns = board.kanban_columns.order(:position).to_a
      return if columns.all? { |column| column.status_ids == [column.target_status_id] && IssueStatus.find_by(id: column.target_status_id)&.name == column.name }

      built = []
      columns.each do |column|
        ids = column.status_ids.presence || [column.target_status_id]
        ids.each do |status_id|
          status = IssueStatus.find_by(id: status_id)
          next unless status
          next if built.any? { |row| row[:target_status_id] == status.id }

          built << {
            name: status.name,
            section_name: column.section_name,
            status_ids: [status.id],
            target_status_id: status.id
          }
        end
      end
      return if built.empty?

      KanbanColumn.transaction do
        board.kanban_columns.destroy_all
        built.each_with_index do |attrs, index|
          board.kanban_columns.create!(attrs.merge(position: index + 1))
        end
      end
    end

    def active_filters(board)
      filters = board.filters.dup
      %w[project_id fixed_version_id tracker_id assigned_to_id author_id scope].each do |key|
        filters[key] = params[key].to_s if params.key?(key)
      end
      filters['fixed_version_id'] = '' if filters['project_id'].blank?
      filters['scope'] = 'all' unless KanbanBoard::SCOPES.include?(filters['scope'].to_s)
      filters
    end

    def filtered_issues(filters)
      scope = Issue.visible
      scope = scope.where(project_id: filters['project_id']) if filters['project_id'].present?
      scope = scope.where(fixed_version_id: filters['fixed_version_id']) if filters['fixed_version_id'].present?
      scope = scope.where(tracker_id: filters['tracker_id']) if filters['tracker_id'].present?
      scope = scope.where(assigned_to_id: filters['assigned_to_id']) if filters['assigned_to_id'].present?
      scope = scope.where(author_id: filters['author_id']) if filters['author_id'].present?
      case filters['scope']
      when 'assigned'
        scope = scope.where(assigned_to_id: User.current.id)
      when 'authored'
        scope = scope.where(author_id: User.current.id)
      when 'watched'
        watched_ids = Watcher.where(watchable_type: 'Issue', user_id: User.current.id).select(:watchable_id)
        scope = scope.where(id: watched_ids)
      end
      scope
    end

    def column_issues(column, scope, offset)
      matched = scope.where(status_id: column.status_ids).order(updated_on: :desc, id: :desc)
      issues = matched.offset(offset).limit(PAGE_SIZE).preload(:tracker, :status, :assigned_to, :priority, :project, :fixed_version)
      {
        id: column.id,
        name: column.name,
        total: matched.count,
        offset: offset,
        issues: issues.map { |issue| issue_payload(issue) }
      }
    end

    def issue_payload(issue)
      {
        id: issue.id,
        subject: issue.subject,
        created_on: issue.created_on,
        updated_on: issue.updated_on,
        due_date: issue.due_date,
        done_ratio: issue.done_ratio,
        tracker: issue.tracker && { id: issue.tracker_id, name: issue.tracker.name },
        status: issue.status && { id: issue.status_id, name: issue.status.name },
        assigned_to: issue.assigned_to && { id: issue.assigned_to_id, name: issue.assigned_to.name },
        priority: issue.priority && { id: issue.priority_id, name: issue.priority.name },
        project: issue.project && { id: issue.project_id, name: issue.project.name },
        fixed_version: issue.fixed_version && { id: issue.fixed_version_id, name: issue.fixed_version.name }
      }
    end

    def payload(board)
      {
        id: board.id,
        name: board.name,
        project_id: board.project_id,
        filters: board.filters,
        group_by: board.group_by,
        columns: board.kanban_columns.order(:position).map do |column|
          {
            id: column.id,
            name: column.name,
            section_name: column.section_name.to_s,
            position: column.position,
            status_ids: column.status_ids,
            target_status_id: column.target_status_id
          }
        end
      }
    end
  end
end
