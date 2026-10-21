# frozen_string_literal: true

module Studio
  class PmController < BaseController
    before_action :authorize_global

    def show
      project = Project.visible.find_by(id: params[:project_id]) if params[:project_id].present?
      unless project
        render json: { project: nil, versions: [], version: nil, summary: nil }
        return
      end

      versions = project.shared_versions.sorted.to_a
      version = pick_version(versions)
      if version.nil?
        render json: {
          project: project_json(project),
          versions: [],
          version: nil,
          summary: nil,
          unversioned_open: unversioned_open_count(project)
        }
        return
      end

      current = load_issues(project, version)
      previous = previous_version(versions, version)
      previous_issues = previous ? load_issues(project, previous) : []
      current_summary = summarize(current)
      previous_summary = previous ? summarize(previous_issues) : nil

      render json: {
        project: project_json(project),
        version: version_json(version),
        previous_version: previous ? version_json(previous) : nil,
        versions: versions.map { |item| version_json(item) },
        summary: current_summary,
        previous_summary: previous_summary,
        compare: compare(current_summary, previous_summary),
        pipeline: pipeline(current),
        assignees: assignees(current),
        priorities: priorities(current),
        trackers: trackers(current),
        health: health_rules(current, version, current_summary),
        unversioned_open: unversioned_open_count(project)
      }
    end

    private

    def pick_version(versions)
      if params[:version_id].present?
        found = versions.find { |item| item.id.to_s == params[:version_id].to_s }
        return found if found
      end
      open_versions = versions.select { |item| item.status == 'open' }
      pool = open_versions.presence || versions
      pool.min_by { |item| [item.effective_date || Date.new(9999, 12, 31), item.id] }
    end

    def previous_version(versions, version)
      ordered = versions.sort_by { |item| [item.effective_date || Date.new(9999, 12, 31), item.id] }
      index = ordered.index { |item| item.id == version.id }
      return nil if index.nil? || index.zero?

      ordered[index - 1]
    end

    def load_issues(project, version)
      Issue.visible.
        where(project_id: project.id, fixed_version_id: version.id).
        includes(:status, :tracker, :assigned_to, :priority).
        to_a
    end

    def bug?(issue)
      issue.tracker&.name.to_s.match?(/错误|bug/i)
    end

    def closed?(issue)
      issue.status&.is_closed?
    end

    def checked?(issue)
      closed?(issue) || issue.status&.name == '测试完成'
    end

    def rate(part, whole)
      return nil if whole.to_i <= 0

      (part.to_f / whole * 100).round(1)
    end

    def summarize(issues)
      bugs = issues.select { |issue| bug?(issue) }
      closed = issues.select { |issue| closed?(issue) }
      checked = issues.select { |issue| checked?(issue) }
      open_issues = issues.reject { |issue| closed?(issue) }
      open_bugs = bugs.reject { |issue| closed?(issue) }
      untouched_bugs = bugs.select { |issue| issue.status&.name == '新建' }
      closed_bugs = bugs.select { |issue| closed?(issue) }
      today = User.current.today
      overdue = open_issues.select { |issue| issue.due_date.present? && issue.due_date < today }
      stale_before = Time.current - 7.days
      stale = open_issues.select { |issue| issue.updated_on.present? && issue.updated_on < stale_before }
      unassigned = open_issues.select { |issue| issue.assigned_to_id.nil? }
      total = issues.size

      {
        total: total,
        checked: checked.size,
        closed: closed.size,
        completion_rate: rate(closed.size, total),
        checked_rate: rate(checked.size, total),
        untouched_bugs: untouched_bugs.size,
        open_bugs: open_bugs.size,
        bug_total: bugs.size,
        bug_rate: rate(bugs.size, total),
        leftover_bug_rate: rate(open_bugs.size, total),
        bug_fix_rate: bugs.empty? ? nil : rate(closed_bugs.size, bugs.size),
        overdue: overdue.size,
        open: open_issues.size,
        stale: stale.size,
        unassigned: unassigned.size
      }
    end

    def pipeline(issues)
      counts = issues.group_by(&:status_id).transform_values(&:size)
      IssueStatus.sorted.map do |status|
        {
          id: status.id,
          name: status.name,
          is_closed: status.is_closed?,
          count: counts[status.id] || 0
        }
      end
    end

    def assignees(issues)
      open_issues = issues.reject { |issue| closed?(issue) }
      total = open_issues.size
      open_issues.group_by(&:assigned_to_id).map do |id, list|
        {
          id: id,
          name: list.first.assigned_to&.name || '未指派',
          count: list.size,
          ratio: rate(list.size, total)
        }
      end.sort_by { |row| -row[:count] }
    end

    def priorities(issues)
      open_issues = issues.reject { |issue| closed?(issue) }
      total = open_issues.size
      counts = open_issues.group_by(&:priority_id).transform_values(&:size)
      IssuePriority.active.sorted.map do |priority|
        count = counts[priority.id] || 0
        next if count.zero?

        {
          id: priority.id,
          name: priority.name,
          position: priority.position,
          count: count,
          ratio: rate(count, total)
        }
      end.compact.sort_by { |row| -row[:position].to_i }
    end

    def trackers(issues)
      bugs = issues.count { |issue| bug?(issue) }
      items = issues.group_by { |issue| issue.tracker&.name || '未分类' }.map do |name, list|
        { name: name, count: list.size, bug: name.to_s.match?(/错误|bug/i) }
      end.sort_by { |row| -row[:count] }
      { bugs: bugs, others: issues.size - bugs, items: items }
    end

    def compare(current, previous)
      return nil unless previous

      {
        total: current[:total] - previous[:total],
        completion_rate: delta(current[:completion_rate], previous[:completion_rate]),
        bug_rate: delta(current[:bug_rate], previous[:bug_rate]),
        leftover_bug_rate: delta(current[:leftover_bug_rate], previous[:leftover_bug_rate])
      }
    end

    def delta(current, previous)
      return nil if current.nil? || previous.nil?

      (current - previous).round(1)
    end

    def health_rules(issues, version, summary)
      small = summary[:total] < 5
      open_count = summary[:open]
      overdue_ratio = open_count.positive? ? (summary[:overdue].to_f / open_count * 100) : 0
      stale_ratio = open_count.positive? ? (summary[:stale].to_f / open_count * 100) : 0
      top = assignees(issues).reject { |row| row[:id].nil? }.max_by { |row| row[:count] }
      version_overdue = version.effective_date.present? && version.effective_date < User.current.today

      [
        bug_rule(summary, small),
        completion_rule(summary, small, version, version_overdue),
        ratio_rule(
          'overdue',
          open_count.positive? && overdue_ratio > 20,
          small,
          '逾期工单偏多',
          "逾期 #{summary[:overdue]} 张，占未关闭工单 #{overdue_ratio.round(1)}%",
          '逾期情况正常',
          "逾期 #{summary[:overdue]} 张"
        ),
        if top && open_count >= 5 && top[:ratio].to_f > 40
          rule('load', 'watch', '未关闭工单过于集中', "#{top[:name]} 承担了 #{top[:ratio]}% 的未关闭工单")
        else
          rule('load', 'ok', '人员负载正常', top ? "最多的是 #{top[:name]}，#{top[:count]} 张" : '没有未关闭工单')
        end,
        ratio_rule(
          'stale',
          open_count.positive? && stale_ratio > 30,
          small,
          '有工单长时间没有更新',
          "超过 7 天未更新的占未关闭工单 #{stale_ratio.round(1)}%",
          '工单更新正常',
          "超过 7 天未更新 #{summary[:stale]} 张"
        ),
        if summary[:unassigned] >= 3
          rule('unassigned', 'watch', '未指派的工单偏多', "#{summary[:unassigned]} 张未关闭工单还没有指派")
        else
          rule('unassigned', 'ok', '指派情况正常', "未指派 #{summary[:unassigned]} 张")
        end
      ]
    end

    def bug_rule(summary, small)
      if summary[:untouched_bugs] >= 3
        rule('bugs', 'risk', '尚未处理的缺陷偏多', "#{summary[:untouched_bugs]} 张缺陷还停在新建")
      elsif !small && summary[:leftover_bug_rate].to_f > 30
        rule('bugs', 'risk', '遗留缺陷率偏高', "遗留缺陷率 #{summary[:leftover_bug_rate]}%")
      elsif small && summary[:leftover_bug_rate].to_f > 30
        rule('bugs', 'insufficient', '缺陷比率样本不足', "纳入只有 #{summary[:total]} 张，遗留缺陷率 #{summary[:leftover_bug_rate]}% 仅供参考")
      else
        rule('bugs', 'ok', '缺陷处理正常', "尚未处理 #{summary[:untouched_bugs]} 张，遗留缺陷率 #{percent(summary[:leftover_bug_rate])}")
      end
    end

    def completion_rule(summary, small, version, version_overdue)
      low = summary[:completion_rate] && summary[:completion_rate] < 50
      if version_overdue && low
        detail = "完成率 #{summary[:completion_rate]}%，完成日期 #{version.effective_date}"
        if small
          rule('completion', 'insufficient', '完成率样本不足', "版本已过完成日期，#{detail}，纳入不足 5 张")
        else
          rule('completion', 'risk', '版本已过期但完成率偏低', detail)
        end
      else
        rule('completion', 'ok', '版本完成进度正常', "完成率 #{percent(summary[:completion_rate])}")
      end
    end

    def ratio_rule(key, hit, small, watch_title, watch_detail, ok_title, ok_detail)
      if hit && small
        rule(key, 'insufficient', '样本不足', watch_detail)
      elsif hit
        rule(key, 'watch', watch_title, watch_detail)
      else
        rule(key, 'ok', ok_title, ok_detail)
      end
    end

    def rule(key, level, title, detail)
      { key: key, level: level, title: title, detail: detail }
    end

    def percent(value)
      value.nil? ? '—' : "#{value}%"
    end

    def unversioned_open_count(project)
      Issue.visible.open.where(project_id: project.id, fixed_version_id: nil).count
    end

    def project_json(project)
      { id: project.id, name: project.name, identifier: project.identifier }
    end

    def version_json(version)
      {
        id: version.id,
        name: version.name,
        status: version.status,
        effective_date: version.effective_date
      }
    end
  end
end
